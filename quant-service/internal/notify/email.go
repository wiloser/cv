package notify

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"html"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"net/textproto"
	"net/url"
	"sort"
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
	return m.send(ctx, recipient, func(from, to *mail.Address) ([]byte, error) {
		return buildMessage(from, to, subject, body), nil
	})
}

func (m *Mailer) SendRich(ctx context.Context, recipient, subject, textBody, htmlBody string) error {
	return m.send(ctx, recipient, func(from, to *mail.Address) ([]byte, error) {
		return buildRichMessage(from, to, subject, textBody, htmlBody)
	})
}

func (m *Mailer) send(ctx context.Context, recipient string, build func(from, to *mail.Address) ([]byte, error)) error {
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
	message, err := build(from, to)
	if err != nil {
		return fmt.Errorf("build email: %w", err)
	}
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

func buildRichMessage(from, to *mail.Address, subject, textBody, htmlBody string) ([]byte, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	parts := []struct {
		contentType string
		content     string
	}{
		{contentType: "text/plain; charset=UTF-8", content: textBody},
		{contentType: "text/html; charset=UTF-8", content: htmlBody},
	}
	for _, part := range parts {
		header := make(textproto.MIMEHeader)
		header.Set("Content-Type", part.contentType)
		header.Set("Content-Transfer-Encoding", "quoted-printable")
		writerPart, err := writer.CreatePart(header)
		if err != nil {
			return nil, err
		}
		quoted := quotedprintable.NewWriter(writerPart)
		if _, err := io.WriteString(quoted, part.content); err != nil {
			_ = quoted.Close()
			return nil, err
		}
		if err := quoted.Close(); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	encodedSubject := mime.QEncoding.Encode("UTF-8", subject)
	contentType := mime.FormatMediaType("multipart/alternative", map[string]string{"boundary": writer.Boundary()})
	headers := strings.Join([]string{
		"Date: " + time.Now().UTC().Format(time.RFC1123Z),
		"From: " + from.String(),
		"To: " + to.String(),
		"Subject: " + encodedSubject,
		"MIME-Version: 1.0",
		"Content-Type: " + contentType,
		"",
		"",
	}, "\r\n")
	return append([]byte(headers), body.Bytes()...), nil
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
	location *time.Location
}

func NewService(accounts *account.Store, mailer *Mailer, locations ...*time.Location) *Service {
	service := &Service{accounts: accounts, mailer: mailer}
	if len(locations) > 0 {
		service.location = locations[0]
	}
	return service
}

func (s *Service) Configured() bool {
	return s != nil && s.mailer != nil && s.mailer.Configured()
}

func (s *Service) SendTest(ctx context.Context, recipient string) error {
	if s == nil || s.mailer == nil {
		return ErrNotConfigured
	}
	plain := "这是一封来自量化监测平台的邮件样式预览。\n\n正式通知会汇总本轮所有符合条件的 EMA 金叉与死叉信号，每个账户只收到一封邮件。"
	return s.mailer.SendRich(ctx, recipient, "量化监测平台 · 邮件样式预览", plain, buildTestDigestHTML(s.locationOrShanghai()))
}

func (s *Service) SendVerificationCode(ctx context.Context, recipient, code string) error {
	if s == nil || s.mailer == nil {
		return ErrNotConfigured
	}
	body := fmt.Sprintf("你好，\n\n你正在注册量化监测平台账户。\n\n邮箱验证码：%s\n\n验证码 10 分钟内有效，请勿转发给任何人。如果不是你本人操作，可以忽略这封邮件。\n\n量化监测平台", code)
	return s.mailer.Send(ctx, recipient, "量化监测平台 · 注册验证码", body)
}

type digestSignal struct {
	Label        string
	InstrumentID string
	Bar          string
	FastPeriod   int
	SlowPeriod   int
	Cross        string
	Price        float64
	FastEMA      float64
	SlowEMA      float64
	EventTime    time.Time
	EventKey     string
}

type recipientDigest struct {
	recipient account.Recipient
	signals   []digestSignal
}

func (s *Service) NotifySignals(ctx context.Context, snapshots []store.Snapshot) error {
	if s == nil || s.accounts == nil || s.mailer == nil || !s.mailer.Configured() {
		return nil
	}
	candidates := make(map[string]*recipientDigest)
	seen := make(map[string]map[string]struct{})
	for _, snapshot := range snapshots {
		cross := strings.ToLower(strings.TrimSpace(snapshot.EMA.Cross))
		if (cross != "golden" && cross != "death") || snapshot.EMA.LatestTime.IsZero() {
			continue
		}
		recipients, err := s.accounts.SignalRecipients(snapshot.InstrumentID, snapshot.FastPeriod, snapshot.SlowPeriod, cross)
		if err != nil {
			return err
		}
		for _, recipient := range recipients {
			eventKey := fmt.Sprintf("%s|%s|%s|%d|%d|%s", recipient.UserID, snapshot.InstrumentID, snapshot.EMA.LatestTime.UTC().Format(time.RFC3339Nano), snapshot.FastPeriod, snapshot.SlowPeriod, cross)
			if seen[recipient.UserID] == nil {
				seen[recipient.UserID] = make(map[string]struct{})
			}
			if _, exists := seen[recipient.UserID][eventKey]; exists {
				continue
			}
			seen[recipient.UserID][eventKey] = struct{}{}
			digest := candidates[recipient.UserID]
			if digest == nil {
				digest = &recipientDigest{recipient: recipient}
				candidates[recipient.UserID] = digest
			}
			label := strings.TrimSpace(recipient.RuleLabel)
			if label == "" {
				label = fmt.Sprintf("EMA %d / %d", snapshot.FastPeriod, snapshot.SlowPeriod)
			}
			digest.signals = append(digest.signals, digestSignal{
				Label:        label,
				InstrumentID: snapshot.InstrumentID,
				Bar:          snapshot.Bar,
				FastPeriod:   snapshot.FastPeriod,
				SlowPeriod:   snapshot.SlowPeriod,
				Cross:        cross,
				Price:        snapshot.EMA.Close,
				FastEMA:      emaValue(snapshot, snapshot.FastPeriod),
				SlowEMA:      emaValue(snapshot, snapshot.SlowPeriod),
				EventTime:    snapshot.EMA.LatestTime,
				EventKey:     eventKey,
			})
		}
	}

	userIDs := make([]string, 0, len(candidates))
	for userID := range candidates {
		userIDs = append(userIDs, userID)
	}
	sort.Strings(userIDs)
	reserved := make([]string, 0)
	for _, userID := range userIDs {
		digest := candidates[userID]
		pending := digest.signals[:0]
		for _, signal := range digest.signals {
			shouldSend, err := s.accounts.BeginNotificationEvent(signal.EventKey)
			if err != nil {
				for _, key := range reserved {
					s.accounts.ReleaseNotificationEvent(key)
				}
				return err
			}
			if shouldSend {
				reserved = append(reserved, signal.EventKey)
				pending = append(pending, signal)
			}
		}
		digest.signals = pending
	}

	var sendErrors []error
	for _, userID := range userIDs {
		digest := candidates[userID]
		if len(digest.signals) == 0 {
			continue
		}
		sort.Slice(digest.signals, func(i, j int) bool {
			left, right := digest.signals[i], digest.signals[j]
			if left.InstrumentID != right.InstrumentID {
				return left.InstrumentID < right.InstrumentID
			}
			if left.FastPeriod != right.FastPeriod {
				return left.FastPeriod < right.FastPeriod
			}
			if left.SlowPeriod != right.SlowPeriod {
				return left.SlowPeriod < right.SlowPeriod
			}
			return left.Cross < right.Cross
		})
		subject := fmt.Sprintf("EMA 策略信号汇总 · %d 条新信号 · %s", len(digest.signals), time.Now().In(s.locationOrShanghai()).Format("2006-01-02"))
		plainBody := buildDigestText(digest.signals, s.locationOrShanghai())
		htmlBody := buildDigestHTML(digest.signals, s.locationOrShanghai())
		if err := s.mailer.SendRich(ctx, digest.recipient.Email, subject, plainBody, htmlBody); err != nil {
			for _, signal := range digest.signals {
				s.accounts.ReleaseNotificationEvent(signal.EventKey)
			}
			sendErrors = append(sendErrors, fmt.Errorf("send notification digest to %s: %w", digest.recipient.Email, err))
			continue
		}
		for _, signal := range digest.signals {
			if err := s.accounts.CompleteNotificationEvent(signal.EventKey); err != nil {
				s.accounts.ReleaseNotificationEvent(signal.EventKey)
				sendErrors = append(sendErrors, fmt.Errorf("record notification event for %s: %w", digest.recipient.Email, err))
			}
		}
	}
	return errors.Join(sendErrors...)
}

func (s *Service) locationOrShanghai() *time.Location {
	if s != nil && s.location != nil {
		return s.location
	}
	location, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.FixedZone("CST", 8*60*60)
	}
	return location
}

func emaValue(snapshot store.Snapshot, period int) float64 {
	for _, value := range snapshot.EMA.Values {
		if value.Period == period {
			return value.Current
		}
	}
	return 0
}

func buildDigestText(signals []digestSignal, location *time.Location) string {
	var body strings.Builder
	_, _ = fmt.Fprintf(&body, "本轮发现 %d 条新的 EMA 信号：\n\n", len(signals))
	for index, signal := range signals {
		direction := "金叉 · 买入观察"
		if signal.Cross == "death" {
			direction = "死叉 · 卖出观察"
		}
		_, _ = fmt.Fprintf(&body, "%02d. %s | %s | %s\n", index+1, signal.InstrumentID, direction, signal.Label)
		_, _ = fmt.Fprintf(&body, "    周期：%s  EMA：%d / %d\n    收盘价：%s  EMA 快/慢：%s / %s\n    信号时间：%s\n\n", signal.Bar, signal.FastPeriod, signal.SlowPeriod, formatPrice(signal.Price), formatPrice(signal.FastEMA), formatPrice(signal.SlowEMA), signal.EventTime.In(location).Format("2006-01-02 15:04 MST"))
	}
	body.WriteString("这是一封策略监测提示，不构成投资建议，平台不会自动下单。")
	return body.String()
}

func buildDigestHTML(signals []digestSignal, location *time.Location) string {
	buyCount, sellCount := 0, 0
	for _, signal := range signals {
		if signal.Cross == "golden" {
			buyCount++
		} else if signal.Cross == "death" {
			sellCount++
		}
	}
	var body strings.Builder
	body.WriteString(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EMA 策略信号汇总</title></head><body style="margin:0;padding:0;background:#f0f1ec;color:#171916;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">`)
	body.WriteString(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f1ec;padding:28px 12px;"><tr><td align="center"><table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;border-collapse:separate;border-spacing:0;">`)
	body.WriteString(`<tr><td style="padding:28px 30px;background:#171916;border-radius:20px 20px 0 0;color:#fff;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td><div style="font-size:11px;letter-spacing:2px;font-weight:700;color:#d9ff63;">QUANT SIGNAL DIGEST</div><div style="margin-top:12px;font-size:26px;line-height:1.2;font-weight:750;letter-spacing:-.6px;">EMA 策略信号汇总</div><div style="margin-top:8px;font-size:13px;color:#b7bbb2;">`)
	body.WriteString(html.EscapeString(time.Now().In(location).Format("2006年01月02日 15:04 MST")))
	body.WriteString(`</div></td><td align="right" valign="top"><span style="display:inline-block;padding:8px 11px;border-radius:999px;background:#d9ff63;color:#171916;font-size:12px;font-weight:800;">`)
	_, _ = fmt.Fprintf(&body, "%d 条信号", len(signals))
	body.WriteString(`</span></td></tr></table></td></tr>`)
	body.WriteString(`<tr><td style="padding:18px 20px;background:#fff;border-left:1px solid #e2e4dd;border-right:1px solid #e2e4dd;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>`)
	writeDigestStat(&body, "金叉 · 买入观察", buyCount, "#1f7448", "#e9f6ed")
	writeDigestStat(&body, "死叉 · 卖出观察", sellCount, "#a83d43", "#fff0ed")
	writeDigestStat(&body, "策略组合", len(signals), "#5557e8", "#eff0ff")
	body.WriteString(`</tr></table></td></tr>`)
	for _, signal := range signals {
		isBuy := signal.Cross == "golden"
		color, background, title := "#1f7448", "#e9f6ed", "金叉 · 买入观察"
		if !isBuy {
			color, background, title = "#a83d43", "#fff0ed", "死叉 · 卖出观察"
		}
		body.WriteString(`<tr><td style="padding:0 20px 14px;background:#fff;border-left:1px solid #e2e4dd;border-right:1px solid #e2e4dd;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e4e6df;border-radius:15px;border-collapse:separate;border-spacing:0;overflow:hidden;"><tr><td width="5" style="background:` + color + `;font-size:0;line-height:0;">&nbsp;</td><td style="padding:17px 18px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td><div style="font-size:11px;font-weight:700;letter-spacing:.5px;color:#8b8f86;">` + html.EscapeString(signal.Label) + `</div><div style="margin-top:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:20px;font-weight:800;letter-spacing:-.4px;color:#171916;">` + html.EscapeString(signal.InstrumentID) + `</div></td><td align="right" valign="top"><span style="display:inline-block;padding:7px 9px;border-radius:999px;background:` + background + `;color:` + color + `;font-size:11px;font-weight:800;">` + title + `</span></td></tr></table>`)
		body.WriteString(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;border-top:1px solid #eef0ea;"><tr>`)
		writeDigestMetric(&body, "周期", signal.Bar)
		writeDigestMetric(&body, "EMA 快 / 慢", fmt.Sprintf("%d / %d", signal.FastPeriod, signal.SlowPeriod))
		writeDigestMetric(&body, "收盘价", formatPrice(signal.Price))
		body.WriteString(`</tr><tr>`)
		writeDigestMetric(&body, fmt.Sprintf("EMA %d", signal.FastPeriod), formatPrice(signal.FastEMA))
		writeDigestMetric(&body, fmt.Sprintf("EMA %d", signal.SlowPeriod), formatPrice(signal.SlowEMA))
		writeDigestMetric(&body, "信号时间", signal.EventTime.In(location).Format("01-02 15:04 MST"))
		body.WriteString(`</tr></table></td></tr></table></td></tr>`)
	}
	body.WriteString(`<tr><td style="padding:20px 24px 24px;background:#fff;border:1px solid #e2e4dd;border-top:0;border-radius:0 0 20px 20px;"><div style="padding:13px 15px;border-radius:12px;background:#f6f7f3;color:#656a60;font-size:11px;line-height:1.7;"><strong style="color:#252822;">风险提示</strong><br>EMA 信号仅用于策略监测，不构成投资建议。请结合仓位与风险自行判断；平台不会自动下单。</div><div style="margin-top:16px;text-align:center;font-size:10px;color:#9a9e95;">量化监测平台 · 本邮件汇总本轮全部符合条件的新信号</div></td></tr>`)
	body.WriteString(`</table></td></tr></table></body></html>`)
	return body.String()
}

func writeDigestStat(body *strings.Builder, label string, value int, color, background string) {
	body.WriteString(`<td width="33.33%" style="padding:0 5px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:12px;background:` + background + `;"><tr><td style="padding:12px;"><div style="font-size:10px;color:#757a71;">` + html.EscapeString(label) + `</div><div style="margin-top:5px;font-size:20px;font-weight:800;color:` + color + `;">`)
	_, _ = fmt.Fprintf(body, "%d", value)
	body.WriteString(`</div></td></tr></table></td>`)
}

func writeDigestMetric(body *strings.Builder, label, value string) {
	body.WriteString(`<td width="33.33%" style="padding:11px 8px 3px 0;vertical-align:top;"><div style="font-size:9px;color:#92968d;">` + html.EscapeString(label) + `</div><div style="margin-top:4px;font-size:11px;font-weight:750;color:#282b25;">` + html.EscapeString(value) + `</div></td>`)
}

func buildTestDigestHTML(location *time.Location) string {
	now := time.Now().In(location)
	samples := []digestSignal{
		{Label: "中周期 · 趋势确认", InstrumentID: "BTC-USDT", Bar: "1D", FastPeriod: 12, SlowPeriod: 26, Cross: "golden", Price: 68421.35, FastEMA: 67980.12, SlowEMA: 67120.48, EventTime: now},
		{Label: "短周期 · 反转观察", InstrumentID: "ETH-USDT", Bar: "1D", FastPeriod: 8, SlowPeriod: 21, Cross: "death", Price: 3521.68, FastEMA: 3518.42, SlowEMA: 3530.06, EventTime: now},
	}
	return buildDigestHTML(samples, location)
}

func formatPrice(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}
