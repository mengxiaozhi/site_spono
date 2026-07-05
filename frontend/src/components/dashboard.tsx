"use client";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  FolderKanban,
  Globe2,
  LayoutDashboard,
  Loader2,
  LogOut,
  MonitorPlay,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { gsap } from "gsap";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, formatBytes, type Deployment, type Domain, type Site, type User } from "@/lib/api";

type AuthMode = "login" | "register";
type DashboardTab = "overview" | "deployments" | "domains" | "settings";
type SecondaryPanel = "create-site" | "upload" | "add-domain" | "rename-site" | "delete-site" | null;
type PublishStepStatus = "done" | "current" | "todo";

const tabs: Array<{ key: DashboardTab; label: string; icon: ReactNode }> = [
  { key: "overview", label: "總覽", icon: <LayoutDashboard className="h-4 w-4" aria-hidden /> },
  { key: "deployments", label: "部署", icon: <Upload className="h-4 w-4" aria-hidden /> },
  { key: "domains", label: "網域", icon: <Globe2 className="h-4 w-4" aria-hidden /> },
  { key: "settings", label: "設定", icon: <Settings className="h-4 w-4" aria-hidden /> }
];

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-lockup ${compact ? "brand-lockup-compact" : ""}`}>
      <img className="brand-logo" src="/spono-logo.jpg" alt="Spono" />
      {!compact && (
        <div className="brand-copy">
          <span className="brand-title">網站控制台</span>
          <span className="brand-subtitle">照著做就能發布</span>
        </div>
      )}
    </div>
  );
}

function PublishStep({
  action,
  copy,
  icon,
  step,
  status,
  title
}: {
  action?: ReactNode;
  copy: string;
  icon: ReactNode;
  step: number;
  status: PublishStepStatus;
  title: string;
}) {
  const label = status === "done" ? "已完成" : status === "current" ? "現在做" : "等等做";

  return (
    <div className={`publish-step publish-step-${status}`}>
      <span className="publish-step-number">{status === "done" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : step}</span>
      <div className="min-w-0">
        <div className="publish-step-heading">
          <span className="publish-step-icon">{icon}</span>
          <span>{title}</span>
          <span className="publish-step-label">{label}</span>
        </div>
        <p className="party-section-copy text-sm">{copy}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function dateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-Hant", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function shortDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-Hant", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: Domain["status"] }) {
  const label = status === "verified" ? "已驗證" : status === "failed" ? "未通過" : "等待驗證";
  const className = status === "verified"
    ? "status-badge-ok"
    : status === "failed"
      ? "status-badge-failed"
      : "status-badge-pending";

  return <span className={`status-badge ${className}`}>{label}</span>;
}

function PrimaryButton({
  children,
  disabled,
  onClick,
  type = "button"
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className="btn-primary">
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  disabled,
  onClick,
  type = "button",
  title
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  title?: string;
}) {
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className="btn-secondary">
      {children}
    </button>
  );
}

function DangerButton({
  children,
  disabled,
  onClick,
  type = "button"
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} className="btn-danger">
      {children}
    </button>
  );
}

function IconButton({
  children,
  disabled,
  label,
  onClick
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="icon-button" aria-label={label} title={label}>
      {children}
    </button>
  );
}

function TextInput({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2" htmlFor={id}>
      <span className="field-label">{label}</span>
      <input
        id={id}
        required={required}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="input-field"
      />
    </label>
  );
}

function Drawer({
  children,
  description,
  disabled,
  id,
  open,
  onClose,
  title
}: {
  children: ReactNode;
  description: string;
  disabled?: boolean;
  id: string;
  open: boolean;
  onClose: () => void;
  title: string;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !drawerRef.current || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(drawerRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18, ease: "power2.out" });
      gsap.fromTo(
        ".drawer-panel",
        { xPercent: 100 },
        { xPercent: 0, duration: 0.38, ease: "power3.out", clearProps: "transform" }
      );
      gsap.fromTo(
        "[data-animate='panel-item']",
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.26, stagger: 0.04, delay: 0.12, ease: "power2.out", clearProps: "all" }
      );
    }, drawerRef);

    return () => ctx.revert();
  }, [open]);

  if (!open) return null;

  function requestClose() {
    if (disabled) return;
    if (!drawerRef.current || prefersReducedMotion()) {
      onClose();
      return;
    }

    const panel = drawerRef.current.querySelector(".drawer-panel");
    gsap.timeline({ onComplete: onClose })
      .to(panel, { xPercent: 100, duration: 0.24, ease: "power2.in" })
      .to(drawerRef.current, { autoAlpha: 0, duration: 0.16, ease: "power2.out" }, 0);
  }

  return (
    <div
      ref={drawerRef}
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <div className="drawer-header">
          <div data-animate="panel-item">
            <p className="party-kicker">引導流程</p>
            <h2 id={`${id}-title`} className="party-section-title">{title}</h2>
            <p className="party-section-copy mt-1 text-sm">{description}</p>
          </div>
          <IconButton label="關閉" onClick={requestClose} disabled={disabled}>
            <X className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
        <div className="drawer-body" data-animate="panel-item">{children}</div>
      </aside>
    </div>
  );
}

function ConfirmDialog({
  body,
  cancelLabel = "取消",
  confirmLabel,
  disabled,
  icon,
  onClose,
  onConfirm,
  open,
  title
}: {
  body: ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  disabled?: boolean;
  icon?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !dialogRef.current || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(dialogRef.current, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.16, ease: "power2.out" });
      gsap.fromTo(
        ".dialog-panel",
        { autoAlpha: 0, scale: 0.96, y: 10 },
        { autoAlpha: 1, scale: 1, y: 0, duration: 0.26, ease: "power3.out", clearProps: "all" }
      );
    }, dialogRef);

    return () => ctx.revert();
  }, [open]);

  if (!open) return null;

  function requestClose() {
    if (disabled) return;
    if (!dialogRef.current || prefersReducedMotion()) {
      onClose();
      return;
    }

    const panel = dialogRef.current.querySelector(".dialog-panel");
    gsap.timeline({ onComplete: onClose })
      .to(panel, { autoAlpha: 0, scale: 0.96, y: 8, duration: 0.16, ease: "power2.in" })
      .to(dialogRef.current, { autoAlpha: 0, duration: 0.14, ease: "power2.out" }, 0);
  }

  return (
    <div
      ref={dialogRef}
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section className="dialog-panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="dialog-header">
          <div className="party-heading">
            <span className="party-heading-icon">{icon ?? <AlertCircle className="h-5 w-5" aria-hidden />}</span>
            <div>
              <p className="party-kicker">確認操作</p>
              <h2 id="confirm-dialog-title" className="party-section-title">{title}</h2>
            </div>
          </div>
          <IconButton label="關閉" onClick={requestClose} disabled={disabled}>
            <X className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
        <div className="dialog-body party-section-copy">{body}</div>
        <div className="dialog-footer">
          <SecondaryButton onClick={requestClose} disabled={disabled}>{cancelLabel}</SecondaryButton>
          <DangerButton onClick={onConfirm} disabled={disabled}>
            {disabled && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </DangerButton>
        </div>
      </section>
    </div>
  );
}

function StatBox({
  icon,
  label,
  value,
  helper
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="party-stat-box">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="party-kicker">{label}</p>
          <strong>{value}</strong>
          <p className="party-section-copy mt-2 text-sm">{helper}</p>
        </div>
        <span className="party-heading-icon">{icon}</span>
      </div>
    </div>
  );
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="party-empty">
      <p className="party-list-title">{title}</p>
      <p className="party-section-copy mt-1">{copy}</p>
    </div>
  );
}

export function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [panelMode, setPanelMode] = useState<SecondaryPanel>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [siteName, setSiteName] = useState("");
  const [siteSettingsName, setSiteSettingsName] = useState("");
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainName, setDomainName] = useState("");
  const [domainPendingDelete, setDomainPendingDelete] = useState<Domain | null>(null);
  const [cnameTarget, setCnameTarget] = useState("sites.example.com");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeSite = useMemo(
    () => sites.find((site) => site.id === activeSiteId) ?? sites[0] ?? null,
    [activeSiteId, sites]
  );
  const activeDeployment = useMemo(
    () => deployments.find((deployment) => deployment.id === activeSite?.activeDeploymentId) ?? null,
    [activeSite?.activeDeploymentId, deployments]
  );
  const verifiedDomains = domains.filter((domain) => domain.status === "verified").length;
  const hasDeployment = Boolean(activeDeployment);
  const hasVerifiedDomain = verifiedDomains > 0;
  const publishProgress = !hasDeployment ? 1 : hasVerifiedDomain ? 3 : 2;

  useEffect(() => {
    if (isBooting || !rootRef.current || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-animate='intro']",
        { autoAlpha: 0, y: 16 },
        { autoAlpha: 1, y: 0, duration: 0.46, stagger: 0.06, ease: "power3.out", clearProps: "all" }
      );
    }, rootRef);

    return () => ctx.revert();
  }, [isBooting, Boolean(user)]);

  useEffect(() => {
    if (!user || isBooting || !rootRef.current || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-animate='tab-panel']",
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.32, ease: "power2.out", clearProps: "all" }
      );
    }, rootRef);

    return () => ctx.revert();
  }, [activeSite?.id, activeTab, isBooting, user]);

  useEffect(() => {
    if (!message || !rootRef.current || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        "[data-animate='toast']",
        { autoAlpha: 0, y: -8 },
        { autoAlpha: 1, y: 0, duration: 0.24, ease: "power2.out", clearProps: "all" }
      );
    }, rootRef);

    return () => ctx.revert();
  }, [message]);

  async function loadSites(nextActiveId?: string) {
    const data = await apiRequest<{ sites: Site[] }>("/api/sites");
    setSites(data.sites);
    setActiveSiteId(nextActiveId ?? data.sites[0]?.id ?? null);
  }

  async function loadDetails(siteId: string) {
    const [deploymentData, domainData] = await Promise.all([
      apiRequest<{ deployments: Deployment[] }>(`/api/sites/${siteId}/deployments`),
      apiRequest<{ domains: Domain[]; cnameTarget: string }>(`/api/sites/${siteId}/domains`)
    ]);
    setDeployments(deploymentData.deployments);
    setDomains(domainData.domains);
    setCnameTarget(domainData.cnameTarget);
  }

  async function bootstrap() {
    setIsBooting(true);
    try {
      try {
        const demo = await apiRequest<{ enabled: boolean }>("/api/demo/status");
        setDemoEnabled(demo.enabled);
      } catch {
        setDemoEnabled(false);
      }

      const data = await apiRequest<{ user: User | null }>("/api/auth/me");
      setUser(data.user);
      if (data.user) {
        await loadSites();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法連線到後端");
    } finally {
      setIsBooting(false);
    }
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!activeSite) {
      setDeployments([]);
      setDomains([]);
      setSiteSettingsName("");
      return;
    }
    setSiteSettingsName(activeSite.name);
    void loadDetails(activeSite.id);
  }, [activeSite?.id]);

  function closePanel() {
    if (!isBusy) setPanelMode(null);
  }

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(successMessage);
    } catch {
      setMessage(text);
    }
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setMessage(null);
    try {
      const path = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const data = await apiRequest<{ user: User }>(path, {
        method: "POST",
        body: { email, password }
      });
      setUser(data.user);
      setPassword("");
      await loadSites();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登入失敗");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDemoLogin() {
    setIsBusy(true);
    setMessage(null);
    try {
      const data = await apiRequest<{ user: User }>("/api/demo/login", {
        method: "POST"
      });
      setUser(data.user);
      await loadSites();
      setMessage("已進入 Demo 模式");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Demo 模式無法使用");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLogout() {
    await apiRequest("/api/auth/logout", { method: "POST" });
    setUser(null);
    setSites([]);
    setActiveSiteId(null);
    setDeployments([]);
    setDomains([]);
  }

  async function handleCreateSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setMessage(null);
    try {
      const data = await apiRequest<{ site: Site }>("/api/sites", {
        method: "POST",
        body: { name: siteName }
      });
      setSiteName("");
      setPanelMode(null);
      setActiveTab("overview");
      await loadSites(data.site.id);
      setMessage("網站已建立");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "建立網站失敗");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSite || !uploadFile) return;
    setIsBusy(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      const data = await apiRequest<{ site: Site; deployment: Deployment }>(`/api/sites/${activeSite.id}/upload`, {
        method: "POST",
        body: formData
      });
      setUploadFile(null);
      setPanelMode(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadSites(data.site.id);
      await loadDetails(data.site.id);
      setActiveTab("deployments");
      setMessage(`部署 v${data.deployment.version} 已啟用`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上傳失敗");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleActivate(deploymentId: string) {
    if (!activeSite) return;
    setIsBusy(true);
    setMessage(null);
    try {
      await apiRequest(`/api/sites/${activeSite.id}/deployments/${deploymentId}/activate`, { method: "POST" });
      await loadSites(activeSite.id);
      await loadDetails(activeSite.id);
      setMessage("部署版本已切換");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "切換版本失敗");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleAddDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSite) return;
    setIsBusy(true);
    setMessage(null);
    try {
      await apiRequest(`/api/sites/${activeSite.id}/domains`, {
        method: "POST",
        body: { hostname: domainName }
      });
      setDomainName("");
      setPanelMode(null);
      await loadDetails(activeSite.id);
      setActiveTab("domains");
      setMessage("網域已新增");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "新增網域失敗");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleVerifyDomain(domainId: string) {
    if (!activeSite) return;
    setIsBusy(true);
    setMessage(null);
    try {
      const data = await apiRequest<{ domain: Domain; cnameTarget: string }>(`/api/domains/${domainId}/verify`, {
        method: "POST"
      });
      await loadDetails(activeSite.id);
      setMessage(data.domain.status === "verified" ? "CNAME 已驗證" : data.domain.lastError || "CNAME 尚未生效");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "驗證失敗");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteDomain(domainId: string) {
    if (!activeSite) return;
    setIsBusy(true);
    setMessage(null);
    try {
      await apiRequest(`/api/domains/${domainId}`, { method: "DELETE" });
      setDomainPendingDelete(null);
      await loadDetails(activeSite.id);
      setMessage("網域已移除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "移除網域失敗");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRenameSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSite) return;
    setIsBusy(true);
    setMessage(null);
    try {
      await apiRequest(`/api/sites/${activeSite.id}`, {
        method: "PATCH",
        body: { name: siteSettingsName }
      });
      setPanelMode(null);
      await loadSites(activeSite.id);
      setMessage("網站名稱已更新");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新網站失敗");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteSite() {
    if (!activeSite) return;
    setIsBusy(true);
    setMessage(null);
    try {
      await apiRequest(`/api/sites/${activeSite.id}`, { method: "DELETE" });
      setPanelMode(null);
      await loadSites();
      setActiveTab("overview");
      setMessage("網站已刪除");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刪除網站失敗");
    } finally {
      setIsBusy(false);
    }
  }

  if (isBooting) {
    return (
      <main className="app-shell grid min-h-screen place-items-center px-4 text-slate-700">
        <div className="party-note-card flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-[#0b9ee8]" aria-hidden />
          <span>載入控制台...</span>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main ref={rootRef} className="app-shell min-h-screen px-4 py-8">
        <section className="party-auth-grid mx-auto w-full max-w-6xl" data-animate="intro">
          <aside className="party-auth-aside" data-animate="intro">
            <div className="space-y-7">
              <BrandLockup />

              <div>
                <p className="party-kicker">Spono 入門</p>
                <h1 className="party-hero-title">不用懂伺服器，也能照著發布網站</h1>
                <p className="party-hero-lead mt-4">登入後照著三個步驟做：上傳 ZIP、綁定網域、打開預覽。每個動作都會在右側面板帶你完成。</p>
              </div>
            </div>

            <div className="auth-guide-list">
              <div className="health-row">
                <Upload className="mt-0.5 h-5 w-5 text-[#0b9ee8]" aria-hidden />
                <div>
                  <p className="party-list-title">1. 上傳網站 ZIP</p>
                  <p className="party-section-copy text-sm">把網站打包成 ZIP，Spono 會替你建立第一個版本。</p>
                </div>
              </div>
              <div className="health-row">
                <Globe2 className="mt-0.5 h-5 w-5 text-[#0b9ee8]" aria-hidden />
                <div>
                  <p className="party-list-title">2. 綁定網域</p>
                  <p className="party-section-copy text-sm">照著畫面提供的 CNAME target 設定，再按驗證。</p>
                </div>
              </div>
              <div className="health-row">
                <ExternalLink className="mt-0.5 h-5 w-5 text-[#0b9ee8]" aria-hidden />
                <div>
                  <p className="party-list-title">3. 開啟預覽</p>
                  <p className="party-section-copy text-sm">確認畫面沒問題，就能分享連結或切換版本。</p>
                </div>
              </div>
            </div>
          </aside>

          <div className="party-auth-panel grid content-center gap-6" data-animate="intro">
            <div className="party-heading">
              <span className="party-heading-icon">
                <ShieldCheck className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="party-kicker">Spono</p>
                <h2 className="party-section-title">登入控制台</h2>
              </div>
            </div>

            <div className="segmented-control">
              <button className={authMode === "login" ? "segment-active" : ""} onClick={() => setAuthMode("login")} type="button">
                登入
              </button>
              <button className={authMode === "register" ? "segment-active" : ""} onClick={() => setAuthMode("register")} type="button">
                註冊
              </button>
            </div>

            <form className="party-form-grid" onSubmit={handleAuth}>
              <TextInput id="auth-email" label="Email" value={email} onChange={setEmail} type="email" required />
              <TextInput id="auth-password" label="密碼" value={password} onChange={setPassword} type="password" required />
              <div className="flex flex-wrap gap-3 pt-1">
                <PrimaryButton type="submit" disabled={isBusy}>
                  {isBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {authMode === "register" ? "建立帳號" : "登入"}
                </PrimaryButton>
                {demoEnabled && (
                  <SecondaryButton onClick={() => void handleDemoLogin()} disabled={isBusy}>
                    <MonitorPlay className="h-4 w-4" aria-hidden />
                    進入 Demo 模式
                  </SecondaryButton>
                )}
              </div>
            </form>

            {message && (
              <div className="party-note-card flex items-start gap-2 text-sm" data-animate="toast">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{message}</span>
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main ref={rootRef} className="app-shell pb-8">
      <header className="top-chrome" data-animate="intro">
        <div className="top-chrome-inner min-h-[72px] px-4 lg:px-8">
          <BrandLockup />
          <nav className="desktop-nav hidden lg:flex" aria-label="主要導覽">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`desktop-nav-link ${activeTab === tab.key ? "desktop-nav-link-active" : ""}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="top-actions">
            <span className="user-chip">{user.email.charAt(0).toUpperCase()}</span>
            <IconButton label="重新整理" onClick={() => void bootstrap()} disabled={isBusy}>
              <RefreshCw className="h-4 w-4" aria-hidden />
            </IconButton>
            <IconButton label="登出" onClick={() => void handleLogout()}>
              <LogOut className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        </div>
      </header>

      <div className="dashboard-shell">
        <aside className="project-rail" data-animate="intro">
          <div className="project-rail-header">
            <div className="party-heading">
              <span className="party-heading-icon">
                <FolderKanban className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="party-kicker">我的專案</p>
                <h2 className="party-section-title">網站</h2>
              </div>
            </div>
            <IconButton label="建立網站" onClick={() => setPanelMode("create-site")} disabled={isBusy}>
              <Plus className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>

          <div className="project-list">
            {sites.length === 0 && <p className="party-section-copy px-2 py-4 text-sm">尚無網站</p>}
            {sites.map((site) => (
              <button
                key={site.id}
                type="button"
                onClick={() => {
                  setActiveSiteId(site.id);
                  setActiveTab("overview");
                }}
                className={`project-list-button ${activeSite?.id === site.id ? "project-list-button-active" : ""}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{site.name}</span>
                  <span className="mt-1 block truncate font-mono text-xs opacity-70">/{site.slug}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              </button>
            ))}
          </div>

          <div className="rail-guide-card">
            <span className="party-heading-icon">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="party-list-title">照著做就能發布</p>
              <p className="party-section-copy text-sm">選網站後看「下一步」，Spono 會告訴你現在該按哪裡。</p>
            </div>
          </div>
        </aside>

        <section className="workbench" data-animate="intro">
          {message && (
            <div className="party-note-card flex items-start gap-2 text-sm" data-animate="toast">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{message}</span>
            </div>
          )}

          {!activeSite ? (
            <section className="party-hero-card" data-animate="tab-panel">
              <div className="space-y-4">
                <p className="party-kicker">第一步</p>
                <h1 className="party-hero-title">先建立一個網站專案</h1>
                <p className="party-hero-lead">有了專案後，Spono 會依序帶你上傳 ZIP、綁定網域、開啟預覽。</p>
                <PrimaryButton onClick={() => setPanelMode("create-site")} disabled={isBusy}>
                  <Plus className="h-4 w-4" aria-hidden />
                  建立網站
                </PrimaryButton>
              </div>
            </section>
          ) : (
            <>
              <section className="site-hero" data-animate="intro">
                <div className="site-hero-main">
                  <div className="site-breadcrumb">
                    <span className="site-breadcrumb-pill">目前專案</span>
                    <span className="font-mono text-xs text-slate-500">/{activeSite.slug}</span>
                  </div>
                  <div className="site-title-row">
                    <span className="site-icon">
                      <MonitorPlay className="h-7 w-7" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h1 className="party-hero-title truncate">{activeSite.name}</h1>
                        <span className={`status-badge ${activeDeployment ? "status-badge-ok" : "status-badge-pending"}`}>
                          {activeDeployment ? "已上線" : "待上傳"}
                        </span>
                      </div>
                      <a href={activeSite.previewUrl} target="_blank" rel="noreferrer" className="site-preview-link">
                        {activeSite.previewUrl}
                        <ExternalLink className="h-4 w-4" aria-hidden />
                      </a>
                    </div>
                  </div>
                  <div className="row-actions justify-start">
                    <a href={activeSite.previewUrl} target="_blank" rel="noreferrer" className="btn-primary">
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      開啟 Preview
                    </a>
                    <SecondaryButton onClick={() => void copyText(activeSite.previewUrl, "Preview URL 已複製")}>
                      <Copy className="h-4 w-4" aria-hidden />
                      複製 URL
                    </SecondaryButton>
                    <SecondaryButton onClick={() => setPanelMode("upload")} disabled={isBusy}>
                      <Upload className="h-4 w-4" aria-hidden />
                      上傳新版
                    </SecondaryButton>
                  </div>
                </div>

                <div className="site-status-panel">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="party-kicker">上線進度</p>
                      <p className="site-status-title">{publishProgress} / 3</p>
                    </div>
                    <span className="publish-step-number publish-step-number-small">{publishProgress}</span>
                  </div>
                  <div className="spono-progress" aria-label={`上線進度 ${publishProgress} / 3`}>
                    <span style={{ width: `${(publishProgress / 3) * 100}%` }} />
                  </div>
                  <div className="site-status-list">
                    <span>{activeDeployment ? `正在使用 v${activeDeployment.version}` : "還沒有版本"}</span>
                    <span>{hasVerifiedDomain ? `${verifiedDomains} 個網域已驗證` : "網域還沒完成"}</span>
                    <span>{activeDeployment ? "可以開啟預覽" : "上傳後才可預覽"}</span>
                  </div>
                </div>
              </section>

              <div className="mobile-tab-strip lg:hidden" data-animate="intro">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={activeTab === tab.key ? "mobile-tab-active" : ""}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === "overview" && (
                <section className="overview-grid" data-animate="tab-panel">
                  <section className="guide-panel">
                    <div className="workbench-heading">
                      <div>
                        <p className="party-kicker">下一步</p>
                        <h2 className="party-section-title">照著做就能發布</h2>
                        <p className="party-section-copy mt-2 text-sm">Spono 會依照目前狀態，把該做的事排在前面。</p>
                      </div>
                      <span className="guide-count">{publishProgress}/3</span>
                    </div>

                    <div className="publish-track">
                      <PublishStep
                        step={1}
                        status={hasDeployment ? "done" : "current"}
                        icon={<Upload className="h-4 w-4" aria-hidden />}
                        title="上傳網站 ZIP"
                        copy={hasDeployment ? `目前使用 v${activeDeployment?.version}，可以隨時上傳新版。` : "選一個包含 index.html 的 ZIP 檔，上傳後就會建立第一個版本。"}
                        action={hasDeployment ? (
                          <SecondaryButton onClick={() => setActiveTab("deployments")}>
                            <Upload className="h-4 w-4" aria-hidden />
                            查看部署
                          </SecondaryButton>
                        ) : (
                          <PrimaryButton onClick={() => setPanelMode("upload")} disabled={isBusy}>
                            <Upload className="h-4 w-4" aria-hidden />
                            前往上傳
                          </PrimaryButton>
                        )}
                      />
                      <PublishStep
                        step={2}
                        status={!hasDeployment ? "todo" : hasVerifiedDomain ? "done" : "current"}
                        icon={<Globe2 className="h-4 w-4" aria-hidden />}
                        title="綁定網域"
                        copy={hasVerifiedDomain ? `${verifiedDomains} 個網域已可使用。` : "把自己的網域加進來，再依照 CNAME target 設定 DNS。"}
                        action={!hasDeployment ? undefined : hasVerifiedDomain ? (
                          <SecondaryButton onClick={() => setActiveTab("domains")}>
                            <Globe2 className="h-4 w-4" aria-hidden />
                            查看網域
                          </SecondaryButton>
                        ) : (
                          <PrimaryButton
                            onClick={() => {
                              setActiveTab("domains");
                              setPanelMode("add-domain");
                            }}
                            disabled={isBusy}
                          >
                            <Plus className="h-4 w-4" aria-hidden />
                            新增網域
                          </PrimaryButton>
                        )}
                      />
                      <PublishStep
                        step={3}
                        status={!hasDeployment ? "todo" : hasVerifiedDomain ? "current" : "todo"}
                        icon={<ExternalLink className="h-4 w-4" aria-hidden />}
                        title="開啟預覽"
                        copy={!hasDeployment ? "先完成上傳，這裡就會出現可開啟的預覽。" : hasVerifiedDomain ? "打開預覽檢查畫面；沒問題就能分享連結。" : "先把網域綁好，最後再確認公開畫面。"}
                        action={hasDeployment && hasVerifiedDomain ? (
                          <a href={activeSite.previewUrl} target="_blank" rel="noreferrer" className="btn-primary">
                            <ExternalLink className="h-4 w-4" aria-hidden />
                            開啟預覽
                          </a>
                        ) : undefined}
                      />
                    </div>
                  </section>

                  <aside className="quick-summary-panel">
                    <div>
                      <p className="party-kicker">狀態摘要</p>
                      <h2 className="party-section-title">這個網站現在如何？</h2>
                    </div>

                    <div className="summary-list">
                      <StatBox icon={<Activity className="h-5 w-5" aria-hidden />} label="部署版本" value={`${deployments.length}`} helper={activeDeployment ? `現在對外顯示 v${activeDeployment.version}` : "還沒上傳任何版本"} />
                      <StatBox icon={<Globe2 className="h-5 w-5" aria-hidden />} label="已驗證網域" value={`${verifiedDomains}`} helper={`${domains.length} 個網域設定`} />
                      <StatBox icon={<Clock3 className="h-5 w-5" aria-hidden />} label="最後更新" value={shortDate(activeSite.updatedAt)} helper="專案最近一次變更" />
                    </div>

                    <div className="cname-helper">
                      <p className="party-list-title">CNAME target</p>
                      <p className="party-section-copy text-sm">DNS 後台只需要把 CNAME 指向這串文字。</p>
                      <div className="code-pill mt-3">
                        <code className="truncate font-mono text-sm text-slate-700">{cnameTarget}</code>
                        <IconButton label="複製 CNAME target" onClick={() => void copyText(cnameTarget, "CNAME target 已複製")}>
                          <Copy className="h-4 w-4" aria-hidden />
                        </IconButton>
                      </div>
                    </div>
                  </aside>
                </section>
              )}

              {activeTab === "deployments" && (
                <section className="party-section-card" data-animate="tab-panel">
                  <div className="section-toolbar">
                    <div className="party-heading">
                      <span className="party-heading-icon"><Upload className="h-5 w-5" aria-hidden /></span>
                      <div>
                        <p className="party-kicker">部署紀錄</p>
                        <h2 className="party-section-title">每次上傳都會留一版</h2>
                        <p className="party-section-copy mt-1 text-sm">上傳錯了也不用怕，可以回到之前的版本。</p>
                      </div>
                    </div>
                    <PrimaryButton onClick={() => setPanelMode("upload")} disabled={isBusy}>
                      <Upload className="h-4 w-4" aria-hidden />
                      上傳新版
                    </PrimaryButton>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {deployments.length === 0 ? (
                      <EmptyState title="尚無部署" copy="上傳包含根目錄 index.html 的 zip 後，系統會建立第一個 deployment。" />
                    ) : deployments.map((deployment) => (
                      <div key={deployment.id} className="deployment-row">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="party-mini-pill">v{deployment.version}</span>
                            {deployment.id === activeSite.activeDeploymentId && <span className="party-mini-pill party-mini-pill-active">目前上線</span>}
                          </div>
                          <p className="party-list-title mt-2 truncate">{deployment.originalName}</p>
                          <p className="party-section-copy text-sm">{deployment.fileCount} 個檔案 · {formatBytes(deployment.totalBytes)} · {dateTime(deployment.createdAt)}</p>
                        </div>
                        {deployment.id === activeSite.activeDeploymentId ? (
                          <span className="status-badge status-badge-ok">使用中</span>
                        ) : (
                          <SecondaryButton onClick={() => void handleActivate(deployment.id)} disabled={isBusy}>
                            <RotateCcw className="h-4 w-4" aria-hidden />
                            回滾到此版
                          </SecondaryButton>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {activeTab === "domains" && (
                <section className="party-section-card" data-animate="tab-panel">
                  <div className="section-toolbar">
                    <div className="party-heading">
                      <span className="party-heading-icon"><Globe2 className="h-5 w-5" aria-hidden /></span>
                      <div>
                        <p className="party-kicker">網域設定</p>
                        <h2 className="party-section-title">把自己的網址接上來</h2>
                        <p className="party-section-copy mt-1 text-sm">新增網域後，照著下方 target 去 DNS 後台設定 CNAME。</p>
                      </div>
                    </div>
                    <PrimaryButton onClick={() => setPanelMode("add-domain")} disabled={isBusy}>
                      <Plus className="h-4 w-4" aria-hidden />
                      新增網域
                    </PrimaryButton>
                  </div>

                  <div className="code-pill mt-5">
                    <code className="truncate font-mono text-sm text-slate-700">{cnameTarget}</code>
                    <IconButton label="複製 CNAME target" onClick={() => void copyText(cnameTarget, "CNAME target 已複製")}>
                      <Copy className="h-4 w-4" aria-hidden />
                    </IconButton>
                  </div>

                  <div className="domain-guide">
                    <p className="party-list-title">照這三步做</p>
                    <ol>
                      <li>在 DNS 後台新增一筆 CNAME。</li>
                      <li>把值指向上面的 target。</li>
                      <li>回到這裡按「驗證」。</li>
                    </ol>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {domains.length === 0 ? (
                      <EmptyState title="尚無自訂網域" copy={`新增網域後，將 CNAME 指向 ${cnameTarget}，再執行驗證。`} />
                    ) : domains.map((domain) => (
                      <div key={domain.id} className="domain-row">
                        <div className="min-w-0">
                          <p className="party-list-title truncate">{domain.hostname}</p>
                          <p className="party-section-copy text-sm">Target: {domain.cnameTarget} · 上次檢查：{shortDate(domain.lastCheckedAt)}</p>
                          {domain.lastError && <p className="mt-1 text-sm text-[#b3261e]">{domain.lastError}</p>}
                        </div>
                        <StatusBadge status={domain.status} />
                        <div className="row-actions justify-start">
                          <SecondaryButton onClick={() => void handleVerifyDomain(domain.id)} disabled={isBusy}>
                            <RefreshCw className="h-4 w-4" aria-hidden />
                            驗證
                          </SecondaryButton>
                          <DangerButton onClick={() => setDomainPendingDelete(domain)} disabled={isBusy}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </DangerButton>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {activeTab === "settings" && (
                <section className="grid gap-4" data-animate="tab-panel">
                  <section className="party-section-card">
                    <div className="section-toolbar">
                      <div className="party-heading">
                        <span className="party-heading-icon"><Settings className="h-5 w-5" aria-hidden /></span>
                        <div>
                          <p className="party-kicker">專案設定</p>
                          <h2 className="party-section-title">名稱與危險操作</h2>
                          <p className="party-section-copy mt-1 text-sm">一般只需要重新命名；刪除會再跳確認視窗。</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3">
                      <div className="settings-row">
                        <div>
                          <p className="party-list-title">網站名稱</p>
                          <p className="party-section-copy text-sm">{activeSite.name}</p>
                        </div>
                        <SecondaryButton
                          onClick={() => {
                            setSiteSettingsName(activeSite.name);
                            setPanelMode("rename-site");
                          }}
                          disabled={isBusy}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                          重新命名
                        </SecondaryButton>
                      </div>
                      <div className="settings-row border-[#f4c7c3] bg-[#fff8f7]">
                        <div>
                          <p className="party-list-title text-[#b3261e]">刪除網站</p>
                          <p className="party-section-copy text-sm">刪除後會移除網站、部署版本與網域設定。</p>
                        </div>
                        <DangerButton onClick={() => setPanelMode("delete-site")} disabled={isBusy}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                          刪除網站
                        </DangerButton>
                      </div>
                    </div>
                  </section>
                </section>
              )}
            </>
          )}
        </section>
      </div>

      <Drawer
        id="create-site-drawer"
        open={panelMode === "create-site"}
        title="建立網站"
        description="建立新的靜態網站專案，之後再上傳 zip 部署版本。"
        disabled={isBusy}
        onClose={closePanel}
      >
        <form className="party-form-grid" onSubmit={handleCreateSite}>
          <div className="drawer-guide">
            <p className="party-list-title">先取一個好認的名字</p>
            <p className="party-section-copy text-sm">例如公司官網、活動頁、作品集。之後可以再改名。</p>
          </div>
          <TextInput id="site-name" label="網站名稱" value={siteName} onChange={setSiteName} placeholder="marketing-site" required />
          <PrimaryButton type="submit" disabled={isBusy}>
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            <Plus className="h-4 w-4" aria-hidden />
            建立網站
          </PrimaryButton>
        </form>
      </Drawer>

      <Drawer
        id="upload-drawer"
        open={panelMode === "upload" && Boolean(activeSite)}
        title="上傳新版本"
        description="選擇 zip 檔，成功後會建立 deployment 並自動設為 active。"
        disabled={isBusy}
        onClose={closePanel}
      >
        <form className="party-form-grid" onSubmit={handleUpload}>
          <div className="drawer-guide">
            <p className="party-list-title">ZIP 裡面要有 index.html</p>
            <p className="party-section-copy text-sm">如果網站檔案放在資料夾裡，請先進到資料夾內再打包，避免多包一層路徑。</p>
          </div>
          <label className="grid gap-2" htmlFor="deployment-zip">
            <span className="field-label">部署 zip</span>
            <input
              id="deployment-zip"
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
              className="input-field file:mr-3 file:rounded file:border-0 file:bg-[#0b9ee8] file:px-3 file:py-1 file:text-white"
            />
          </label>
          <PrimaryButton type="submit" disabled={isBusy || !uploadFile}>
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            <Upload className="h-4 w-4" aria-hidden />
            上傳 zip
          </PrimaryButton>
        </form>
      </Drawer>

      <Drawer
        id="add-domain-drawer"
        open={panelMode === "add-domain" && Boolean(activeSite)}
        title="新增網域"
        description={`新增後請將 DNS CNAME 指向 ${cnameTarget}，再回到列表驗證。`}
        disabled={isBusy}
        onClose={closePanel}
      >
        <form className="party-form-grid" onSubmit={handleAddDomain}>
          <div className="drawer-guide">
            <p className="party-list-title">先填你的公開網址</p>
            <p className="party-section-copy text-sm">新增後去 DNS 後台把 CNAME 指向這個 target：{cnameTarget}</p>
          </div>
          <TextInput id="domain-name" label="自訂網域" value={domainName} onChange={setDomainName} placeholder="www.example.com" required />
          <PrimaryButton type="submit" disabled={isBusy || !domainName}>
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            <Plus className="h-4 w-4" aria-hidden />
            新增網域
          </PrimaryButton>
        </form>
      </Drawer>

      <Drawer
        id="rename-site-drawer"
        open={panelMode === "rename-site" && Boolean(activeSite)}
        title="重新命名網站"
        description="只更新控制台中的網站名稱，不會改變既有 slug、部署或網域。"
        disabled={isBusy}
        onClose={closePanel}
      >
        <form className="party-form-grid" onSubmit={handleRenameSite}>
          <TextInput id="settings-name" label="網站名稱" value={siteSettingsName} onChange={setSiteSettingsName} required />
          <PrimaryButton type="submit" disabled={isBusy}>
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            儲存設定
          </PrimaryButton>
        </form>
      </Drawer>

      <ConfirmDialog
        open={panelMode === "delete-site" && Boolean(activeSite)}
        title="刪除網站"
        confirmLabel="刪除網站"
        disabled={isBusy}
        icon={<Trash2 className="h-5 w-5" aria-hidden />}
        onClose={closePanel}
        onConfirm={() => void handleDeleteSite()}
        body={(
          <p>
            確定要刪除「{activeSite?.name}」？此操作會移除部署版本與網域設定，無法從控制台還原。
          </p>
        )}
      />

      <ConfirmDialog
        open={Boolean(domainPendingDelete)}
        title="移除網域"
        confirmLabel="移除網域"
        disabled={isBusy}
        icon={<Trash2 className="h-5 w-5" aria-hidden />}
        onClose={() => {
          if (!isBusy) setDomainPendingDelete(null);
        }}
        onConfirm={() => {
          if (domainPendingDelete) void handleDeleteDomain(domainPendingDelete.id);
        }}
        body={(
          <p>
            確定要移除「{domainPendingDelete?.hostname}」？DNS 設定不會被修改，但控制台將停止追蹤此網域。
          </p>
        )}
      />
    </main>
  );
}
