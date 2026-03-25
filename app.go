package main

import (
	"context"
	"fmt"
	"sync"

	backend "zshell/internal/app"
)

type DesktopApp struct {
	serverURL string
	server    *backend.Server
	mu        sync.RWMutex
}

func NewDesktopApp() (*DesktopApp, error) {
	server, err := backend.NewServer()
	if err != nil {
		return nil, err
	}

	url, err := server.Start("127.0.0.1:0", false)
	if err != nil {
		return nil, err
	}

	return &DesktopApp{
		serverURL: url,
		server:    server,
	}, nil
}

func (a *DesktopApp) BackendURL() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.serverURL
}

func (a *DesktopApp) BackendHealth() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	if a.serverURL == "" {
		return "backend unavailable"
	}
	return fmt.Sprintf("backend ready at %s", a.serverURL)
}

func (a *DesktopApp) shutdown(ctx context.Context) {
	if a.server == nil {
		return
	}
	_ = a.server.Shutdown(ctx)
}
