package app

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"zshell/internal/storage"
)

func TestHealthz(t *testing.T) {
	t.Parallel()

	server := testServer(t)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)

	server.mux.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}

	var payload map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload["status"] != "ok" {
		t.Fatalf("expected status ok, got %q", payload["status"])
	}
}

func TestCreateAndListHost(t *testing.T) {
	t.Parallel()

	server := testServer(t)
	body := `{"name":"demo","address":"127.0.0.1","port":22,"username":"root","platform":"linux","authType":"password"}`

	postRecorder := httptest.NewRecorder()
	postRequest := httptest.NewRequest(http.MethodPost, "/api/hosts", strings.NewReader(body))
	postRequest.Header.Set("Content-Type", "application/json")
	server.mux.ServeHTTP(postRecorder, postRequest)
	if postRecorder.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d", postRecorder.Code)
	}

	getRecorder := httptest.NewRecorder()
	getRequest := httptest.NewRequest(http.MethodGet, "/api/hosts", nil)
	server.mux.ServeHTTP(getRecorder, getRequest)
	if getRecorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", getRecorder.Code)
	}

	var payload []map[string]any
	if err := json.Unmarshal(getRecorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(payload) != 1 {
		t.Fatalf("expected 1 host, got %d", len(payload))
	}
}

func testServer(t *testing.T) *Server {
	t.Helper()

	store, err := storage.NewHostStore(filepath.Join(t.TempDir(), "hosts.json"))
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	return newServerWithStore(store)
}
