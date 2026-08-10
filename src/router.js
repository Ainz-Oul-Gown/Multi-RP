// src/router.js — Простой SPA-роутер
import { ROUTES } from './config.js';

class Router {
  constructor() {
    this.routes = [];
    this.currentRoute = null;
    this.onNavigate = null;

    window.addEventListener('popstate', () => this.resolve());
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (link && link.href.startsWith(window.location.origin)) {
        e.preventDefault();
        this.navigate(new URL(link.href).pathname);
      }
    });
  }

  add(pattern, handler) {
    // Convert /session/:id to RegExp
    const paramNames = [];
    const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    this.routes.push({
      pattern,
      regex: new RegExp(`^${regexStr}$`),
      paramNames,
      handler,
    });
    return this;
  }

  resolve() {
    const path = window.location.pathname;

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
    if (window.location.pathname === path) return;
    window.history.pushState({}, '', path);
    this.resolve();
  }
}

export const router = new Router();
