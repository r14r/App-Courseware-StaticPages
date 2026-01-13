set shell := ["bash", "-cu"]

# Default task: run dev server
default: dev

# Install npm dependencies
install:
	npm install

# Start Vite dev server (0.0.0.0:5173)
dev:
	npm run dev -- --host 0.0.0.0 --port 5173

# Build production assets
build:
	npm run build

# Preview production build (0.0.0.0:4173)
preview:
	npm run preview -- --host 0.0.0.0 --port 4173

# Remove node_modules and dist
clean:
	rm -rf node_modules dist
