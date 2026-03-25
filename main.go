package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app, err := NewDesktopApp()
	if err != nil {
		log.Fatalf("start desktop app: %v", err)
	}

	err = wails.Run(&options.App{
		Title:            "zshell",
		Width:            1460,
		Height:           960,
		MinWidth:         1200,
		MinHeight:        760,
		DisableResize:    false,
		Frameless:        false,
		StartHidden:      false,
		HideWindowOnClose: false,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 6, G: 12, B: 21, A: 1},
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
	})
	if err != nil {
		log.Fatalf("run wails app: %v", err)
	}
}
