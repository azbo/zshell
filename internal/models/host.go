package models

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
)

const (
	PlatformLinux   = "linux"
	PlatformWindows = "windows"

	AuthPassword = "password"
	AuthKey      = "key"
)

type Host struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Address      string `json:"address"`
	Port         int    `json:"port"`
	Username     string `json:"username"`
	Platform     string `json:"platform"`
	AuthType     string `json:"authType"`
	Password     string `json:"password,omitempty"`
	KeyPath      string `json:"keyPath,omitempty"`
	DefaultShell string `json:"defaultShell,omitempty"`
}

func (h Host) Normalize() Host {
	h.Name = strings.TrimSpace(h.Name)
	h.Address = strings.TrimSpace(h.Address)
	h.Username = strings.TrimSpace(h.Username)
	h.Platform = strings.ToLower(strings.TrimSpace(h.Platform))
	h.AuthType = strings.ToLower(strings.TrimSpace(h.AuthType))
	h.Password = strings.TrimSpace(h.Password)
	h.KeyPath = strings.TrimSpace(h.KeyPath)
	h.DefaultShell = strings.TrimSpace(h.DefaultShell)
	if h.Port == 0 {
		h.Port = 22
	}
	return h
}

func (h Host) Validate() error {
	if h.Name == "" {
		return errors.New("name is required")
	}
	if h.Address == "" {
		return errors.New("address is required")
	}
	if h.Username == "" {
		return errors.New("username is required")
	}
	if h.Port < 1 || h.Port > 65535 {
		return fmt.Errorf("port %d is invalid", h.Port)
	}
	switch h.Platform {
	case PlatformLinux, PlatformWindows:
	default:
		return fmt.Errorf("platform %q is invalid", h.Platform)
	}
	switch h.AuthType {
	case AuthPassword:
	case AuthKey:
		if h.KeyPath == "" {
			return errors.New("keyPath is required for key auth")
		}
	default:
		return fmt.Errorf("authType %q is invalid", h.AuthType)
	}
	return nil
}

func NewID() (string, error) {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
