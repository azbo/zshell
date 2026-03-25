package storage

import (
	"errors"
	"fmt"

	"github.com/99designs/keyring"
)

var ErrCredentialNotFound = errors.New("credential not found")

type CredentialStore interface {
	Get(hostID string) (string, bool, error)
	Set(hostID, password string) error
	Delete(hostID string) error
}

type KeyringStore struct {
	ring keyring.Keyring
}

func NewCredentialStore(serviceName string) (*KeyringStore, error) {
	if serviceName == "" {
		serviceName = "zshell"
	}

	ring, err := keyring.Open(keyring.Config{
		ServiceName: serviceName,
		AllowedBackends: []keyring.BackendType{
			keyring.WinCredBackend,
			keyring.KeychainBackend,
			keyring.SecretServiceBackend,
			keyring.KWalletBackend,
			keyring.PassBackend,
			keyring.KeyCtlBackend,
		},
	})
	if err != nil {
		return nil, err
	}
	return &KeyringStore{ring: ring}, nil
}

func (s *KeyringStore) Get(hostID string) (string, bool, error) {
	item, err := s.ring.Get(credentialKey(hostID))
	if err != nil {
		if errors.Is(err, keyring.ErrKeyNotFound) {
			return "", false, nil
		}
		return "", false, err
	}
	return string(item.Data), true, nil
}

func (s *KeyringStore) Set(hostID, password string) error {
	return s.ring.Set(keyring.Item{
		Key:         credentialKey(hostID),
		Data:        []byte(password),
		Label:       fmt.Sprintf("zshell credential for %s", hostID),
		Description: "Remote host password saved by zshell",
	})
}

func (s *KeyringStore) Delete(hostID string) error {
	err := s.ring.Remove(credentialKey(hostID))
	if errors.Is(err, keyring.ErrKeyNotFound) {
		return nil
	}
	return err
}

func credentialKey(hostID string) string {
	return "host:" + hostID
}
