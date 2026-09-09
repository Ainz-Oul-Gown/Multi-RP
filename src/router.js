// src/router.js — SPA-роутер с Hash-based routing (совместим с GitHub Pages)
import { ROUTES } from './config.js';

class Router {
  constructor() {
    this.routes = [];
    this.currentRoute = null;
    this.onNavigate = null;

    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', () => this.resolve());
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (link) {
          const href = link.getAttribute('href');
          // Обрабатываем внутренние ссылки (начинаются с /)
          if (href && href.startsWith('/') && !href.startsWith('//')) {
            e.preventDefault();
            this.navigate(href);
          }
        }
      });
    }
  }

  add(pattern, handler) {
    const paramNames = [];
    const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const newRoute = {
      pattern,
      regex: new RegExp(`^${regexStr}$`),
      paramNames,
      handler,
    };

    const existingIndex = this.routes.findIndex((r) => r.pattern === pattern);
    if (existingIndex !== -1) {
      this.routes[existingIndex] = newRoute;
    } else {
      this.routes.push(newRoute);
    }
    return this;
  }

  // Извлекаем путь из hash: #/session/123 → /session/123
  _getPath() {
    const hash = window.location.hash.slice(1) || '/';
    return hash.split('?')[0]; // Убираем query string
  }

  resolve() {
    const path = this._getPath();

    for (const route of this.routes) {
      const match = path.match(route.regex);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });
        this.currentRoute = { pattern: route.pattern, params };
        route.handler(params);
        return;
      }
    }

    // Fallback to lobby
    this.navigate('/');
  }

  navigate(path) {
    const currentPath = this._getPath();
    if (currentPath === path) return;
    window.location.hash = '#' + path;
  }
}

export const router = new Router();
