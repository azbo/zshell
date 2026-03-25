package storage

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"sync"

	"zshell/internal/models"
)

var ErrHostNotFound = errors.New("host not found")

type HostStore struct {
	path string
	mu   sync.Mutex
}

func NewHostStore(path string) (*HostStore, error) {
	if path == "" {
		configDir, err := os.UserConfigDir()
		if err != nil {
			return nil, err
		}
		path = filepath.Join(configDir, "zshell", "hosts.json")
	}
	return &HostStore{path: path}, nil
}

func (s *HostStore) Path() string {
	return s.path
}

func (s *HostStore) List() ([]models.Host, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.readLocked()
}

func (s *HostStore) Get(id string) (models.Host, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	hosts, err := s.readLocked()
	if err != nil {
		return models.Host{}, false, err
	}
	for _, host := range hosts {
		if host.ID == id {
			return host, true, nil
		}
	}
	return models.Host{}, false, nil
}

func (s *HostStore) Save(host models.Host) (models.Host, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	host = host.Normalize()
	if host.ID == "" {
		id, err := models.NewID()
		if err != nil {
			return models.Host{}, err
		}
		host.ID = id
	}
	if err := host.Validate(); err != nil {
		return models.Host{}, err
	}

	hosts, err := s.readLocked()
	if err != nil {
		return models.Host{}, err
	}

	index := slices.IndexFunc(hosts, func(item models.Host) bool {
		return item.ID == host.ID
	})
	if index >= 0 {
		hosts[index] = host
	} else {
		hosts = append(hosts, host)
	}

	if err := s.writeLocked(hosts); err != nil {
		return models.Host{}, err
	}
	return host, nil
}

func (s *HostStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	hosts, err := s.readLocked()
	if err != nil {
		return err
	}
	index := slices.IndexFunc(hosts, func(item models.Host) bool {
		return item.ID == id
	})
	if index < 0 {
		return ErrHostNotFound
	}

	hosts = append(hosts[:index], hosts[index+1:]...)
	return s.writeLocked(hosts)
}

func (s *HostStore) readLocked() ([]models.Host, error) {
	data, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return []models.Host{}, nil
	}
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return []models.Host{}, nil
	}

	var hosts []models.Host
	if err := json.Unmarshal(data, &hosts); err != nil {
		return nil, err
	}
	return hosts, nil
}

func (s *HostStore) writeLocked(hosts []models.Host) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(hosts, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o600)
}
