package notify

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"net/url"
	"strings"
	"testing"
)

func TestParseProxyURL(t *testing.T) {
	tests := []struct {
		name   string
		value  string
		scheme string
		host   string
	}{
		{name: "http with implicit scheme", value: "127.0.0.1:7890", scheme: "http", host: "127.0.0.1"},
		{name: "socks5h with credentials", value: "socks5h://user:pass@127.0.0.1:7891", scheme: "socks5h", host: "127.0.0.1"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			parsed, err := parseProxyURL(test.value)
			if err != nil {
				t.Fatalf("parseProxyURL() error = %v", err)
			}
			if parsed.Scheme != test.scheme || parsed.Hostname() != test.host {
				t.Fatalf("parseProxyURL() = %s://%s, want %s://%s", parsed.Scheme, parsed.Hostname(), test.scheme, test.host)
			}
		})
	}

	for _, value := range []string{"ftp://127.0.0.1:21", "http://127.0.0.1:7890/path"} {
		if _, err := parseProxyURL(value); err == nil {
			t.Fatalf("parseProxyURL(%q) expected an error", value)
		}
	}
}

func TestDialHTTPConnect(t *testing.T) {
	listener := startTestListener(t)
	defer listener.Close()
	proxyURL, _ := url.Parse("http://" + listener.Addr().String())
	serverErrors := make(chan error, 1)
	go func() {
		connection, err := listener.Accept()
		if err != nil {
			serverErrors <- err
			return
		}
		defer connection.Close()
		reader := bufio.NewReader(connection)
		requestLine, err := reader.ReadString('\n')
		if err != nil {
			serverErrors <- err
			return
		}
		if got, want := strings.TrimSpace(requestLine), "CONNECT smtp.gmail.com:465 HTTP/1.1"; got != want {
			serverErrors <- fmt.Errorf("request line = %q, want %q", got, want)
			return
		}
		if err := readProxyHeaders(reader); err != nil {
			serverErrors <- err
			return
		}
		if _, err := io.WriteString(connection, "HTTP/1.1 200 Connection Established\r\n\r\n"); err != nil {
			serverErrors <- err
			return
		}
		marker := make([]byte, len("hello"))
		if _, err := io.ReadFull(connection, marker); err != nil {
			serverErrors <- err
			return
		}
		if string(marker) != "hello" {
			serverErrors <- fmt.Errorf("tunnel marker = %q, want hello", marker)
			return
		}
		serverErrors <- nil
	}()

	connection, err := dialHTTPConnect(context.Background(), proxyURL, "smtp.gmail.com:465")
	if err != nil {
		t.Fatalf("dialHTTPConnect() error = %v", err)
	}
	if err := writeAll(connection, []byte("hello")); err != nil {
		connection.Close()
		t.Fatalf("write tunneled data: %v", err)
	}
	_ = connection.Close()
	if err := <-serverErrors; err != nil {
		t.Fatal(err)
	}
}

func TestDialSOCKS5(t *testing.T) {
	listener := startTestListener(t)
	defer listener.Close()
	proxyURL, _ := url.Parse("socks5://" + listener.Addr().String())
	serverErrors := make(chan error, 1)
	go func() {
		connection, err := listener.Accept()
		if err != nil {
			serverErrors <- err
			return
		}
		defer connection.Close()
		greeting := make([]byte, 3)
		if _, err := io.ReadFull(connection, greeting); err != nil {
			serverErrors <- err
			return
		}
		if string(greeting) != string([]byte{0x05, 0x01, 0x00}) {
			serverErrors <- fmt.Errorf("SOCKS5 greeting = %v", greeting)
			return
		}
		if err := writeAll(connection, []byte{0x05, 0x00}); err != nil {
			serverErrors <- err
			return
		}
		requestHeader := make([]byte, 5)
		if _, err := io.ReadFull(connection, requestHeader); err != nil {
			serverErrors <- err
			return
		}
		if string(requestHeader[:4]) != string([]byte{0x05, 0x01, 0x00, 0x03}) {
			serverErrors <- fmt.Errorf("SOCKS5 request header = %v", requestHeader[:4])
			return
		}
		host := make([]byte, requestHeader[4]+2)
		if _, err := io.ReadFull(connection, host); err != nil {
			serverErrors <- err
			return
		}
		if got, want := string(host[:len(host)-2]), "smtp.gmail.com"; got != want {
			serverErrors <- fmt.Errorf("SOCKS5 target host = %q, want %q", got, want)
			return
		}
		port := int(host[len(host)-2])<<8 | int(host[len(host)-1])
		if port != 465 {
			serverErrors <- fmt.Errorf("SOCKS5 target port = %d, want 465", port)
			return
		}
		if err := writeAll(connection, []byte{0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0x01, 0xbb}); err != nil {
			serverErrors <- err
			return
		}
		marker := make([]byte, len("hello"))
		if _, err := io.ReadFull(connection, marker); err != nil {
			serverErrors <- err
			return
		}
		if string(marker) != "hello" {
			serverErrors <- fmt.Errorf("tunnel marker = %q, want hello", marker)
			return
		}
		serverErrors <- nil
	}()

	connection, err := dialSOCKS5(context.Background(), proxyURL, "smtp.gmail.com:465")
	if err != nil {
		t.Fatalf("dialSOCKS5() error = %v", err)
	}
	if err := writeAll(connection, []byte("hello")); err != nil {
		connection.Close()
		t.Fatalf("write tunneled data: %v", err)
	}
	_ = connection.Close()
	if err := <-serverErrors; err != nil {
		t.Fatal(err)
	}
}

func startTestListener(t *testing.T) net.Listener {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("net.Listen() error = %v", err)
	}
	return listener
}

func readProxyHeaders(reader *bufio.Reader) error {
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return err
		}
		if strings.TrimSpace(line) == "" {
			return nil
		}
	}
}
