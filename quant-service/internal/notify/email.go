package notify

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"net/url"
	"strconv"
	"strings"
	"time"

	"cv/quant-service/internal/account"
	"cv/quant-service/internal/config"
	"cv/quant-service/internal/store"
)

var ErrNotConfigured = errors.New("SMTP email notification is not configured")
var ErrInvalidRecipient = errors.New("email recipient is invalid")

type Mailer struct {
	cfg config.Config
}

func NewMailer(cfg config.Config) *Mailer {
	return &Mailer{cfg: cfg}
}

func (m *Mailer) Configured() bool {
	return m != nil && strings.TrimSpace(m.cfg.SMTPHost) != "" &&
		strings.TrimSpace(m.cfg.SMTPUser) != "" && strings.TrimSpace(m.cfg.SMTPPassword) != "" &&
		strings.TrimSpace(m.cfg.SMTPFrom) != "" && (m.cfg.SMTPPort == 465 || m.cfg.SMTPPort == 587)
}

func (m *Mailer) Send(ctx context.Context, recipient, subject, body string) error {
	if !m.Configured() {
		return ErrNotConfigured
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	from, err := parseMailbox(m.cfg.SMTPFrom)
	if err != nil {
		return fmt.Errorf("invalid SMTP_FROM: %w", err)
	}
	to, err := parseMailbox(recipient)
	if err != nil {
		return err
	}
	message := buildMessage(from, to, subject, body)
	if err := m.sendMessage(ctx, from.Address, to.Address, message); err != nil {
		return fmt.Errorf("send email: %w", err)
	}
	return nil
}

func (m *Mailer) sendMessage(ctx context.Context, from, recipient string, message []byte) error {
	address := net.JoinHostPort(m.cfg.SMTPHost, strconv.Itoa(m.cfg.SMTPPort))
	connection, err := m.dialSMTP(ctx, address)
	if err != nil {
		return fmt.Errorf("SMTP dial: %w", err)
	}
	setConnectionDeadline(ctx, connection)
	if m.cfg.SMTPPort == 465 {
		tlsConnection := tls.Client(connection, &tls.Config{ServerName: m.cfg.SMTPHost, MinVersion: tls.VersionTLS12})
		if err := tlsConnection.HandshakeContext(ctx); err != nil {
			_ = connection.Close()
			return fmt.Errorf("SMTP TLS handshake: %w", err)
		}
		connection = tlsConnection
	}

	client, err := smtp.NewClient(connection, m.cfg.SMTPHost)
	if err != nil {
		_ = connection.Close()
		return fmt.Errorf("SMTP greeting: %w", err)
	}
	defer client.Close()
	if m.cfg.SMTPPort == 587 {
		if supported, _ := client.Extension("STARTTLS"); !supported {
			return errors.New("SMTP server does not support STARTTLS")
		}
		if err := client.StartTLS(&tls.Config{ServerName: m.cfg.SMTPHost, MinVersion: tls.VersionTLS12}); err != nil {
			return fmt.Errorf("SMTP STARTTLS: %w", err)
		}
	}
	if err := client.Auth(smtp.PlainAuth("", m.cfg.SMTPUser, m.cfg.SMTPPassword, m.cfg.SMTPHost)); err != nil {
		return fmt.Errorf("SMTP authentication: %w", err)
	}
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("SMTP MAIL FROM: %w", err)
	}
	if err := client.Rcpt(recipient); err != nil {
		return fmt.Errorf("SMTP RCPT TO: %w", err)
	}
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("SMTP DATA: %w", err)
	}
	if _, err := writer.Write(message); err != nil {
		_ = writer.Close()
		return fmt.Errorf("SMTP write message: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("SMTP accept message: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := client.Quit(); err != nil && !errors.Is(err, io.EOF) {
		return fmt.Errorf("SMTP QUIT: %w", err)
	}
	return nil
}

func (m *Mailer) dialSMTP(ctx context.Context, target string) (net.Conn, error) {
	proxyValue := strings.TrimSpace(m.cfg.SMTPProxy)
	if proxyValue == "" {
		return (&net.Dialer{Timeout: 15 * time.Second}).DialContext(ctx, "tcp", target)
	}

	proxyURL, err := parseProxyURL(proxyValue)
	if err != nil {
		return nil, err
	}
	switch strings.ToLower(proxyURL.Scheme) {
	case "http", "https":
		return dialHTTPConnect(ctx, proxyURL, target)
	case "socks5", "socks5h":
		return dialSOCKS5(ctx, proxyURL, target)
	default:
		return nil, fmt.Errorf("unsupported SMTP_PROXY scheme %q (use http, socks5 or socks5h)", proxyURL.Scheme)
	}
}

func parseProxyURL(value string) (*url.URL, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, errors.New("SMTP_PROXY must not be empty")
	}
	if !strings.Contains(value, "://") {
		value = "http://" + value
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return nil, fmt.Errorf("invalid SMTP_PROXY: %w", err)
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" && scheme != "socks5" && scheme != "socks5h" {
		return nil, fmt.Errorf("unsupported SMTP_PROXY scheme %q (use http, socks5 or socks5h)", parsed.Scheme)
	}
	if parsed.Hostname() == "" {
		return nil, errors.New("SMTP_PROXY must include a proxy host")
	}
	if (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("SMTP_PROXY must be a proxy URL without a path or query")
	}
	parsed.Scheme = scheme
	return parsed, nil
}

func proxyAddress(proxyURL *url.URL) (string, error) {
	port := proxyURL.Port()
	if port == "" {
		switch strings.ToLower(proxyURL.Scheme) {
		case "http":
			port = "80"
		case "https":
			port = "443"
		case "socks5", "socks5h":
			port = "1080"
		}
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return "", errors.New("SMTP_PROXY port must be between 1 and 65535")
	}
	return net.JoinHostPort(proxyURL.Hostname(), strconv.Itoa(portNumber)), nil
}

func dialHTTPConnect(ctx context.Context, proxyURL *url.URL, target string) (net.Conn, error) {
	address, err := proxyAddress(proxyURL)
	if err != nil {
		return nil, err
	}
	connection, err := (&net.Dialer{Timeout: 15 * time.Second}).DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, err
	}
	keepConnection := false
	defer func() {
		if !keepConnection {
			_ = connection.Close()
		}
	}()
	setConnectionDeadline(ctx, connection)

	if proxyURL.Scheme == "https" {
		tlsConnection := tls.Client(connection, &tls.Config{
			ServerName: proxyURL.Hostname(),
			MinVersion: tls.VersionTLS12,
		})
		if err := tlsConnection.HandshakeContext(ctx); err != nil {
			return nil, fmt.Errorf("HTTPS proxy TLS handshake: %w", err)
		}
		connection = tlsConnection
	}

	request := "CONNECT " + target + " HTTP/1.1\r\nHost: " + target + "\r\n"
	if proxyURL.User != nil {
		password, _ := proxyURL.User.Password()
		credentials := base64.StdEncoding.EncodeToString([]byte(proxyURL.User.Username() + ":" + password))
		request += "Proxy-Authorization: Basic " + credentials + "\r\n"
	}
	request += "Connection: keep-alive\r\n\r\n"
	if _, err := io.WriteString(connection, request); err != nil {
		return nil, fmt.Errorf("HTTP proxy CONNECT request: %w", err)
	}

	reader := bufio.NewReader(connection)
	statusLine, err := reader.ReadString('\n')
	if err != nil {
		return nil, fmt.Errorf("HTTP proxy CONNECT response: %w", err)
	}
	fields := strings.Fields(strings.TrimSpace(statusLine))
	if len(fields) < 2 {
		return nil, errors.New("HTTP proxy returned an invalid CONNECT response")
	}
	statusCode, err := strconv.Atoi(fields[1])
	if err != nil || statusCode != httpConnectSuccess {
		return nil, fmt.Errorf("HTTP proxy CONNECT returned %s", strings.TrimSpace(statusLine))
	}
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return nil, fmt.Errorf("HTTP proxy CONNECT headers: %w", err)
		}
		if strings.TrimSpace(line) == "" {
			break
		}
	}
	keepConnection = true
	return connection, nil
}

const httpConnectSuccess = 200

func dialSOCKS5(ctx context.Context, proxyURL *url.URL, target string) (net.Conn, error) {
	address, err := proxyAddress(proxyURL)
	if err != nil {
		return nil, err
	}
	connection, err := (&net.Dialer{Timeout: 15 * time.Second}).DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, err
	}
	keepConnection := false
	defer func() {
		if !keepConnection {
			_ = connection.Close()
		}
	}()
	setConnectionDeadline(ctx, connection)

	methods := []byte{0x00}
	username, password := "", ""
	if proxyURL.User != nil {
		username = proxyURL.User.Username()
		password, _ = proxyURL.User.Password()
		if len(username) > 255 || len(password) > 255 {
			return nil, errors.New("SMTP_PROXY username and password must be at most 255 bytes")
		}
		methods = append(methods, 0x02)
	}
	if err := writeAll(connection, append([]byte{0x05, byte(len(methods))}, methods...)); err != nil {
		return nil, fmt.Errorf("SOCKS5 negotiation: %w", err)
	}
	selection := make([]byte, 2)
	if _, err := io.ReadFull(connection, selection); err != nil {
		return nil, fmt.Errorf("SOCKS5 negotiation response: %w", err)
	}
	if selection[0] != 0x05 {
		return nil, errors.New("SOCKS5 proxy returned an invalid version")
	}
	switch selection[1] {
	case 0x00:
	case 0x02:
		auth := []byte{0x01, byte(len(username))}
		auth = append(auth, username...)
		auth = append(auth, byte(len(password)))
		auth = append(auth, password...)
		if err := writeAll(connection, auth); err != nil {
			return nil, fmt.Errorf("SOCKS5 authentication: %w", err)
		}
		result := make([]byte, 2)
		if _, err := io.ReadFull(connection, result); err != nil {
			return nil, fmt.Errorf("SOCKS5 authentication response: %w", err)
		}
		if result[1] != 0x00 {
			return nil, errors.New("SOCKS5 proxy authentication failed")
		}
	case 0xff:
		return nil, errors.New("SOCKS5 proxy does not accept the configured authentication")
	default:
		return nil, fmt.Errorf("SOCKS5 proxy selected unsupported authentication method 0x%02x", selection[1])
	}

	host, port, err := net.SplitHostPort(target)
	if err != nil {
		return nil, fmt.Errorf("invalid SMTP target: %w", err)
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return nil, errors.New("SMTP target port must be between 1 and 65535")
	}
	if len(host) > 255 {
		return nil, errors.New("SMTP target host is too long for SOCKS5")
	}
	request := []byte{0x05, 0x01, 0x00, 0x03, byte(len(host))}
	request = append(request, host...)
	request = append(request, byte(portNumber>>8), byte(portNumber))
	if err := writeAll(connection, request); err != nil {
		return nil, fmt.Errorf("SOCKS5 CONNECT request: %w", err)
	}
	response := make([]byte, 4)
	if _, err := io.ReadFull(connection, response); err != nil {
		return nil, fmt.Errorf("SOCKS5 CONNECT response: %w", err)
	}
	if response[0] != 0x05 {
		return nil, errors.New("SOCKS5 proxy returned an invalid CONNECT version")
	}
	if response[1] != 0x00 {
		return nil, fmt.Errorf("SOCKS5 CONNECT failed with code 0x%02x", response[1])
	}
	if err := discardSOCKS5Address(connection, response[3]); err != nil {
		return nil, fmt.Errorf("SOCKS5 CONNECT response address: %w", err)
	}
	keepConnection = true
	return connection, nil
}

func discardSOCKS5Address(reader io.Reader, addressType byte) error {
	var addressLength int
	switch addressType {
	case 0x01:
		addressLength = net.IPv4len
	case 0x03:
		length := []byte{0}
		if _, err := io.ReadFull(reader, length); err != nil {
			return err
		}
		addressLength = int(length[0])
	case 0x04:
		addressLength = net.IPv6len
	default:
		return fmt.Errorf("unsupported SOCKS5 address type 0x%02x", addressType)
	}
	address := make([]byte, addressLength+2)
	_, err := io.ReadFull(reader, address)
	return err
}

func writeAll(writer io.Writer, data []byte) error {
	for len(data) > 0 {
		written, err := writer.Write(data)
		if err != nil {
			return err
		}
		if written == 0 {
			return io.ErrShortWrite
		}
		data = data[written:]
	}
	return nil
}

func buildMessage(from, to *mail.Address, subject, body string) []byte {
	encodedSubject := mime.QEncoding.Encode("UTF-8", subject)
	return []byte(strings.Join([]string{
		"Date: " + time.Now().UTC().Format(time.RFC1123Z),
		"From: " + from.String(),
		"To: " + to.String(),
		"Subject: " + encodedSubject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n"))
}

func parseMailbox(value string) (*mail.Address, error) {
	parsed, err := mail.ParseAddress(strings.TrimSpace(value))
	if err != nil || strings.TrimSpace(parsed.Address) == "" || !strings.Contains(parsed.Address, "@") {
		return nil, ErrInvalidRecipient
	}
	return parsed, nil
}

func setConnectionDeadline(ctx context.Context, connection net.Conn) {
	if deadline, ok := ctx.Deadline(); ok {
		_ = connection.SetDeadline(deadline)
		return
	}
	_ = connection.SetDeadline(time.Now().Add(30 * time.Second))
}

type Service struct {
	accounts *account.Store
	mailer   *Mailer
}

func NewService(accounts *account.Store, mailer *Mailer) *Service {
	return &Service{accounts: accounts, mailer: mailer}
}

func (s *Service) Configured() bool {
	return s != nil && s.mailer != nil && s.mailer.Configured()
}

func (s *Service) SendTest(ctx context.Context, recipient string) error {
	if s == nil || s.mailer == nil {
		return ErrNotConfigured
	}
	return s.mailer.Send(ctx, recipient, "量化监测平台 · 邮件通知测试", "这是一封来自量化监测平台的测试邮件。\n\n如果你能看到这封邮件，说明买入/卖出信号通知已经可以正常投递。")
}

func (s *Service) SendVerificationCode(ctx context.Context, recipient, code string) error {
	if s == nil || s.mailer == nil {
		return ErrNotConfigured
	}
	body := fmt.Sprintf("你好，\n\n你正在注册量化监测平台账户。\n\n邮箱验证码：%s\n\n验证码 10 分钟内有效，请勿转发给任何人。如果不是你本人操作，可以忽略这封邮件。\n\n量化监测平台", code)
	return s.mailer.Send(ctx, recipient, "量化监测平台 · 注册验证码", body)
}

func (s *Service) NotifySignal(ctx context.Context, snapshot store.Snapshot) error {
	if s == nil || s.accounts == nil || s.mailer == nil || !s.mailer.Configured() {
		return nil
	}
	cross := strings.ToLower(strings.TrimSpace(snapshot.EMA.Cross))
	if cross != "golden" && cross != "death" {
		return nil
	}
	recipients, err := s.accounts.SignalRecipients(snapshot.InstrumentID, cross)
	if err != nil {
		return err
	}
	if len(recipients) == 0 {
		return nil
	}

	action := "买入"
	if cross == "death" {
		action = "卖出"
	}
	eventTime := snapshot.EMA.LatestTime.UTC().Format("2006-01-02T15:04:05.000Z")
	for _, recipient := range recipients {
		key := fmt.Sprintf("%s|%s|%s|%d|%d|%s", recipient.UserID, snapshot.InstrumentID, eventTime, snapshot.FastPeriod, snapshot.SlowPeriod, cross)
		shouldSend, err := s.accounts.BeginNotificationEvent(key)
		if err != nil {
			return err
		}
		if !shouldSend {
			continue
		}
		subject := fmt.Sprintf("%s EMA 信号 · %s", snapshot.InstrumentID, action)
		body := fmt.Sprintf("量化监测平台检测到新的 EMA 信号。\n\n标的：%s\n信号：%s（%s EMA 交叉）\n收盘价：%.8f\nEMA 参数：%d / %d\n信号时间：%s\n\n请结合仓位、风险和回测结果自行判断，平台不会自动替你下单。", snapshot.InstrumentID, action, cross, snapshot.EMA.Close, snapshot.FastPeriod, snapshot.SlowPeriod, eventTime)
		if err := s.mailer.Send(ctx, recipient.Email, subject, body); err != nil {
			s.accounts.ReleaseNotificationEvent(key)
			return err
		}
		if err := s.accounts.CompleteNotificationEvent(key); err != nil {
			return err
		}
	}
	return nil
}
