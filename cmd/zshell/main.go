package main

import (
	"log"

	"zshell/internal/app"
)

func main() {
	server, err := app.NewServer()
	if err != nil {
		log.Fatalf("initialize server: %v", err)
	}

	if err := server.Run(); err != nil {
		log.Fatalf("run server: %v", err)
	}
}
