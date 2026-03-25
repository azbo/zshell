package session

import (
	"fmt"
	"io"
	"net"
	"path"
	"sort"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"

	"zshell/internal/models"
	"zshell/internal/storage"
)

type FileService struct {
	store *storage.HostStore
}

func NewFileService(store *storage.HostStore) *FileService {
	return &FileService{store: store}
}

func (s *FileService) List(hostID, password, remotePath string) (models.RemoteListing, error) {
	host, err := s.lookupHost(hostID)
	if err != nil {
		return models.RemoteListing{}, err
	}

	client, err := dialSSH(host, password)
	if err != nil {
		return models.RemoteListing{}, err
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		return models.RemoteListing{}, err
	}
	defer sftpClient.Close()

	workingPath := normalizeRemotePath(remotePath)
	entries, err := sftpClient.ReadDir(workingPath)
	if err != nil {
		return models.RemoteListing{}, err
	}

	items := make([]models.RemoteEntry, 0, len(entries))
	for _, entry := range entries {
		items = append(items, models.RemoteEntry{
			Name:    entry.Name(),
			Path:    path.Join(workingPath, entry.Name()),
			IsDir:   entry.IsDir(),
			Size:    entry.Size(),
			Mode:    entry.Mode().String(),
			ModTime: entry.ModTime().Format(time.RFC3339),
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].IsDir != items[j].IsDir {
			return items[i].IsDir
		}
		return items[i].Name < items[j].Name
	})

	return models.RemoteListing{
		Path:    workingPath,
		Entries: items,
	}, nil
}

func (s *FileService) Upload(hostID, password, remotePath, fileName string, reader io.Reader) (models.RemoteEntry, error) {
	host, err := s.lookupHost(hostID)
	if err != nil {
		return models.RemoteEntry{}, err
	}

	client, err := dialSSH(host, password)
	if err != nil {
		return models.RemoteEntry{}, err
	}
	defer client.Close()

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		return models.RemoteEntry{}, err
	}
	defer sftpClient.Close()

	targetPath := path.Join(normalizeRemotePath(remotePath), fileName)
	file, err := sftpClient.Create(targetPath)
	if err != nil {
		return models.RemoteEntry{}, err
	}
	defer file.Close()

	if _, err := io.Copy(file, reader); err != nil {
		return models.RemoteEntry{}, err
	}

	stat, err := sftpClient.Stat(targetPath)
	if err != nil {
		return models.RemoteEntry{}, err
	}

	return models.RemoteEntry{
		Name:    stat.Name(),
		Path:    targetPath,
		IsDir:   stat.IsDir(),
		Size:    stat.Size(),
		Mode:    stat.Mode().String(),
		ModTime: stat.ModTime().Format(time.RFC3339),
	}, nil
}

func (s *FileService) Download(hostID, password, remotePath string) (io.ReadCloser, string, error) {
	host, err := s.lookupHost(hostID)
	if err != nil {
		return nil, "", err
	}

	client, err := dialSSH(host, password)
	if err != nil {
		return nil, "", err
	}

	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		client.Close()
		return nil, "", err
	}

	targetPath := normalizeRemotePath(remotePath)
	file, err := sftpClient.Open(targetPath)
	if err != nil {
		sftpClient.Close()
		client.Close()
		return nil, "", err
	}

	return &downloadStream{
		ReadCloser: file,
		sftp:       sftpClient,
		client:     client,
	}, path.Base(targetPath), nil
}

func normalizeRemotePath(remotePath string) string {
	if remotePath == "" || remotePath == "." {
		return "."
	}
	return path.Clean(remotePath)
}

type downloadStream struct {
	io.ReadCloser
	sftp   *sftp.Client
	client *ssh.Client
}

func (d *downloadStream) Close() error {
	readErr := d.ReadCloser.Close()
	sftpErr := d.sftp.Close()
	clientErr := d.client.Close()
	if readErr != nil {
		return readErr
	}
	if sftpErr != nil {
		return sftpErr
	}
	return clientErr
}

func (s *FileService) lookupHost(hostID string) (models.Host, error) {
	host, ok, err := s.store.Get(hostID)
	if err != nil {
		return models.Host{}, err
	}
	if !ok {
		return models.Host{}, storage.ErrHostNotFound
	}
	return host, nil
}

func dialSSH(host models.Host, password string) (*ssh.Client, error) {
	config, err := buildClientConfig(host, password)
	if err != nil {
		return nil, err
	}

	address := net.JoinHostPort(host.Address, fmt.Sprintf("%d", host.Port))
	return ssh.Dial("tcp", address, config)
}
