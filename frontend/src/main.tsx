import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import "./mobile.css";
import "./admin.css";
import { SessionProvider, useSession } from "./session";
import { ThemeProvider } from "./theme";
import { LangProvider, useT } from "./i18n";
import LoginPage from "./pages/LoginPage";
import UserMapPage from "./pages/UserMapPage";
import AdminPage from "./pages/AdminPage";
import DemoPage from "./pages/DemoPage";
import type { ReactNode } from "react";

function RequireUser({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, ready } = useSession();
  const t = useT();
  if (!ready) return <div className="splash">{t("Chargement…")}</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LangProvider>
    <ThemeProvider>
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireUser>
                <UserMapPage />
              </RequireUser>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireUser admin>
                <AdminPage />
              </RequireUser>
            }
          />
          <Route
            path="/demo"
            element={
              <RequireUser admin>
                <DemoPage />
              </RequireUser>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
    </ThemeProvider>
    </LangProvider>
  </React.StrictMode>,
);
