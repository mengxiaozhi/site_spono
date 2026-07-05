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
  Sparkles,
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
type SecondaryPanel = "create-site" | "generate-site" | "upload" | "add-domain" | "rename-site" | "delete-site" | null;
type PublishStepStatus = "done" | "current" | "todo";
type NextStepActionConfig = {
  disabled?: boolean;
  href?: string;
  onNext?: () => void;
  title?: string;
};

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
  return (
    <div className={`publish-step publish-step-${status}`} aria-current={status === "current" ? "step" : undefined}>
      <span className="publish-step-number">{status === "done" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : step}</span>
      <div className="min-w-0">
        <div className="publish-step-heading">
          <span className="publish-step-icon">{icon}</span>
          <span>{title}</span>
        </div>
        <p className="party-section-copy text-sm">{copy}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

function stepStatus(isDone: boolean, isCurrent: boolean): PublishStepStatus {
  if (isDone) return "done";
  if (isCurrent) return "current";
  return "todo";
}

function NextStepAction({ disabled, href, onNext, title = "下一步" }: NextStepActionConfig) {
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        aria-label={title}
        className={`btn-primary ${disabled ? "btn-disabled" : ""}`}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
      >
        下一步
        <ChevronRight className="h-4 w-4" aria-hidden />
      </a>
    );
  }

  return (
    <button type="button" onClick={onNext} disabled={disabled} aria-label={title} className="btn-primary">
      下一步
      <ChevronRight className="h-4 w-4" aria-hidden />
    </button>
  );
}

function NextStepCard({
  action,
  copy,
  icon,
  title
}: {
  action: NextStepActionConfig;
  copy: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="next-step-dialog" aria-label={`下一步：${title}`}>
      <span className="next-step-avatar">{icon}</span>
      <div className="next-step-content">
        <h2 className="party-section-title">{title}</h2>
        <p className="party-section-copy text-sm">{copy}</p>
        <div className="next-step-actions">
          <NextStepAction {...action} title={`下一步：${title}`} />
        </div>
      </div>
    </section>
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

function StatusText({ status }: { status: Domain["status"] }) {
  const label = status === "verified" ? "已驗證" : status === "failed" ? "未通過" : "等待驗證";
  const className = status === "verified"
    ? "row-state-ok"
    : status === "failed"
      ? "row-state-danger"
      : "row-state-warning";

  return <span className={`row-state ${className}`}>{label}</span>;
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

function TextArea({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  rows = 5
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  rows?: number;
}) {
  return (
    <label className="grid gap-2" htmlFor={id}>
      <span className="field-label">{label}</span>
      <textarea
        id={id}
        required={required}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="input-field textarea-field"
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
  const [aiSiteName, setAiSiteName] = useState("");
  const [aiBrief, setAiBrief] = useState("");
  const [aiAudience, setAiAudience] = useState("");
  const [aiStyle, setAiStyle] = useState("");
  const [aiSections, setAiSections] = useState("");
  const [aiContact, setAiContact] = useState("");
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
  const unverifiedDomain = domains.find((domain) => domain.status !== "verified") ?? null;
  const hasDeployment = Boolean(activeDeployment);
  const hasVerifiedDomain = verifiedDomains > 0;
  const guideTotal = 4;
  const currentGuideStep = !activeSite ? 1 : !hasDeployment ? 2 : !hasVerifiedDomain ? 3 : 4;
  const completedGuideSteps =
    (activeSite ? 1 : 0) +
    (hasDeployment ? 1 : 0) +
    (hasVerifiedDomain ? 1 : 0) +
    (hasDeployment && hasVerifiedDomain ? 1 : 0);

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

  function openGeneratePanel() {
    setAiSiteName(activeSite?.name ?? aiSiteName);
    setPanelMode("generate-site");
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
      setMessage("網站已建立，下一步請用 Gemini 生成第一版或上傳 ZIP");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "建立網站失敗");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleGenerateSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSite && !aiSiteName.trim()) return;
    if (!aiBrief.trim()) return;
    setIsBusy(true);
    setMessage(null);
    try {
      const data = await apiRequest<{
        site: Site;
        deployment: Deployment;
        generated: { siteName: string; summary: string };
      }>("/api/sites/generate", {
        method: "POST",
        body: {
          siteId: activeSite?.id,
          name: activeSite?.name ?? aiSiteName,
          brief: aiBrief,
          audience: aiAudience,
          style: aiStyle,
          sections: aiSections,
          contact: aiContact
        }
      });
      setAiBrief("");
      setAiAudience("");
      setAiStyle("");
      setAiSections("");
      setAiContact("");
      if (!activeSite) setAiSiteName("");
      setPanelMode(null);
      await loadSites(data.site.id);
      await loadDetails(data.site.id);
      setActiveTab("overview");
      setMessage(`Gemini 已生成 v${data.deployment.version}，下一步請設定網域：${data.generated.summary}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gemini 生成失敗");
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
      setActiveTab("overview");
      setMessage(`部署 v${data.deployment.version} 已啟用，下一步請設定網域`);
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
      setActiveTab("overview");
      setMessage("網域已新增，下一步請設定 DNS 後驗證");
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
      if (data.domain.status === "verified") {
        setActiveTab("overview");
        setMessage("CNAME 已驗證，下一步請開啟預覽");
      } else {
        setMessage(data.domain.lastError || "CNAME 尚未生效，修正 DNS 後再按下一步");
      }
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

  const nextGuide = !activeSite
    ? {
        step: 1,
        title: "用 Gemini 生成第一個網站",
        copy: "按下一步輸入網站名稱、產業與內容需求，Spono 會直接建立專案並部署第一版。",
        icon: <Sparkles className="h-5 w-5" aria-hidden />,
        action: {
          disabled: isBusy,
          onNext: openGeneratePanel
        }
      }
    : !hasDeployment
      ? {
          step: 2,
          title: "用 Gemini 生成第一版",
          copy: `目前正在設定「${activeSite.name}」。描述網站需求後，Gemini 會生成可預覽的靜態頁面；也可以到部署頁上傳 ZIP。`,
          icon: <Sparkles className="h-5 w-5" aria-hidden />,
          action: {
            disabled: isBusy,
            onNext: openGeneratePanel
          }
        }
      : !hasVerifiedDomain
        ? unverifiedDomain
          ? {
              step: 3,
              title: "驗證剛新增的網域",
              copy: `請先在 DNS 後台把 ${unverifiedDomain.hostname} 的 CNAME 指向 ${cnameTarget}。設定完成後按下一步，Spono 會立即幫你驗證。`,
              icon: <Globe2 className="h-5 w-5" aria-hidden />,
              action: {
                disabled: isBusy,
                onNext: () => {
                  setActiveTab("domains");
                  void handleVerifyDomain(unverifiedDomain.id);
                }
              }
            }
          : {
              step: 3,
              title: "新增自訂網域",
              copy: "按下一步填入公開網址，新增後再依照 CNAME target 到 DNS 後台設定。",
              icon: <Globe2 className="h-5 w-5" aria-hidden />,
              action: {
                disabled: isBusy,
                onNext: () => {
                  setActiveTab("domains");
                  setPanelMode("add-domain");
                }
              }
            }
        : {
            step: 4,
            title: "打開預覽做最後確認",
            copy: "部署與網域都已完成。按下一步開啟 Preview，確認畫面沒問題後就能分享連結。",
            icon: <ExternalLink className="h-5 w-5" aria-hidden />,
            action: {
              href: activeSite.previewUrl
            }
          };

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
                <h1 className="party-hero-title">從登入開始，一路按下一步發布網站</h1>
                <p className="party-hero-lead mt-4">每次只處理一件事。登入後 Spono 會用 Gemini 生成第一版，也保留 ZIP 上傳、網域設定與預覽流程。</p>
              </div>
            </div>

            <div className="auth-guide-list">
              <div className="health-row">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-[#0b9ee8]" aria-hidden />
                <div>
                  <p className="party-list-title">1. 登入或建立帳號</p>
                  <p className="party-section-copy text-sm">先進入控制台，下一步才會開始建立網站。</p>
                </div>
              </div>
              <div className="health-row">
                <Sparkles className="mt-0.5 h-5 w-5 text-[#0b9ee8]" aria-hidden />
                <div>
                  <p className="party-list-title">2. Gemini 生成第一版</p>
                  <p className="party-section-copy text-sm">輸入網站名稱、產業與內容需求，系統會自動建立 deployment。</p>
                </div>
              </div>
              <div className="health-row">
                <Upload className="mt-0.5 h-5 w-5 text-[#0b9ee8]" aria-hidden />
                <div>
                  <p className="party-list-title">3. 需要時上傳 ZIP</p>
                  <p className="party-section-copy text-sm">已有網站檔案時，也能維持原本手動上傳流程。</p>
                </div>
              </div>
              <div className="health-row">
                <Globe2 className="mt-0.5 h-5 w-5 text-[#0b9ee8]" aria-hidden />
                <div>
                  <p className="party-list-title">4. 綁定網域並預覽</p>
                  <p className="party-section-copy text-sm">設定 DNS、完成驗證，再打開 Preview 做最後確認。</p>
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
                  下一步
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </PrimaryButton>
                {demoEnabled && (
                  <SecondaryButton onClick={() => void handleDemoLogin()} disabled={isBusy}>
                    <MonitorPlay className="h-4 w-4" aria-hidden />
                    使用 Demo
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
                <h2 className="party-section-title">我的網站</h2>
              </div>
            </div>
            <div className="rail-header-actions">
              <IconButton label="AI 生成網站" onClick={openGeneratePanel} disabled={isBusy}>
                <Sparkles className="h-4 w-4" aria-hidden />
              </IconButton>
              <IconButton label="建立網站" onClick={() => setPanelMode("create-site")} disabled={isBusy}>
                <Plus className="h-4 w-4" aria-hidden />
              </IconButton>
            </div>
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

        </aside>

        <section className="workbench" data-animate="intro">
          {message && (
            <div className="party-note-card flex items-start gap-2 text-sm" data-animate="toast">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{message}</span>
            </div>
          )}

          {!activeSite ? (
            <section className="party-hero-card split" data-animate="tab-panel">
              <div className="space-y-4">
                <h1 className="party-hero-title">用 Gemini 生成或建立網站專案</h1>
                <p className="party-hero-lead">輸入網站需求後，Spono 會自動建立專案並部署第一版；也可以先建立空專案，再手動上傳 ZIP。</p>
                <div className="row-actions justify-start">
                  <NextStepAction {...nextGuide.action} title={`下一步：${nextGuide.title}`} />
                  <SecondaryButton onClick={() => setPanelMode("create-site")} disabled={isBusy}>
                    <Plus className="h-4 w-4" aria-hidden />
                    建立空專案
                  </SecondaryButton>
                </div>
              </div>
              <NextStepCard
                title={nextGuide.title}
                copy={nextGuide.copy}
                icon={nextGuide.icon}
                action={nextGuide.action}
              />
            </section>
          ) : (
            <>
              <section className="site-hero" data-animate="intro">
                <div className="site-hero-main">
                  <p className="site-slug">/{activeSite.slug}</p>
                  <div className="site-title-row">
                    <span className="site-icon">
                      <MonitorPlay className="h-7 w-7" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="site-title-stack">
                        <h1 className="party-hero-title truncate">{activeSite.name}</h1>
                        <span className={`site-state-text ${activeDeployment ? "site-state-ok" : "site-state-warning"}`}>
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
                    <NextStepAction {...nextGuide.action} title={`下一步：${nextGuide.title}`} />
                    <SecondaryButton onClick={() => void copyText(activeSite.previewUrl, "Preview URL 已複製")}>
                      <Copy className="h-4 w-4" aria-hidden />
                      複製 URL
                    </SecondaryButton>
                    <SecondaryButton onClick={openGeneratePanel} disabled={isBusy}>
                      <Sparkles className="h-4 w-4" aria-hidden />
                      AI 生成新版
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
                      <p className="site-status-heading">下一步</p>
                      <p className="site-status-title">{nextGuide.title}</p>
                    </div>
                  </div>
                  <div className="spono-progress" aria-label={`完成進度 ${completedGuideSteps} / ${guideTotal}`}>
                    <span style={{ width: `${(completedGuideSteps / guideTotal) * 100}%` }} />
                  </div>
                  <div className="site-status-list">
                    <span>{completedGuideSteps} / {guideTotal} 已完成</span>
                    <span>{activeDeployment ? `正在使用 v${activeDeployment.version}` : "還沒有版本"}</span>
                    <span>{hasVerifiedDomain ? `${verifiedDomains} 個網域已驗證` : "網域還沒完成"}</span>
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
                        <h2 className="party-section-title">一次只做一個決定</h2>
                        <p className="party-section-copy mt-2 text-sm">主要操作都從這張對話卡開始，完成後會自動切到下一個步驟。</p>
                      </div>
                    </div>

                    <NextStepCard
                      title={nextGuide.title}
                      copy={nextGuide.copy}
                      icon={nextGuide.icon}
                      action={nextGuide.action}
                    />

                    <div className="publish-track">
                      <PublishStep
                        step={1}
                        status="done"
                        icon={<FolderKanban className="h-4 w-4" aria-hidden />}
                        title="建立或選擇網站"
                        copy={`正在操作「${activeSite.name}」，之後的下一步都會套用到這個專案。`}
                      />
                      <PublishStep
                        step={2}
                        status={stepStatus(hasDeployment, currentGuideStep === 2)}
                        icon={<Sparkles className="h-4 w-4" aria-hidden />}
                        title="生成或上傳第一版"
                        copy={hasDeployment ? `目前使用 v${activeDeployment?.version}，可以隨時用 Gemini 生成新版或上傳 ZIP。` : "描述需求讓 Gemini 生成靜態網站；也可以在部署頁改用 ZIP 上傳。"}
                        action={!hasDeployment ? (
                          <NextStepAction {...nextGuide.action} title={`下一步：${nextGuide.title}`} />
                        ) : undefined}
                      />
                      <PublishStep
                        step={3}
                        status={stepStatus(hasVerifiedDomain, currentGuideStep === 3)}
                        icon={<Globe2 className="h-4 w-4" aria-hidden />}
                        title="綁定網域"
                        copy={hasVerifiedDomain ? `${verifiedDomains} 個網域已可使用。` : "把自己的網域加進來，再依照 CNAME target 設定 DNS。"}
                        action={hasDeployment && !hasVerifiedDomain ? (
                          <NextStepAction {...nextGuide.action} title={`下一步：${nextGuide.title}`} />
                        ) : undefined}
                      />
                      <PublishStep
                        step={4}
                        status={!hasDeployment || !hasVerifiedDomain ? "todo" : "current"}
                        icon={<ExternalLink className="h-4 w-4" aria-hidden />}
                        title="開啟預覽"
                        copy={!hasDeployment ? "先完成上傳，這裡就會出現可開啟的預覽。" : hasVerifiedDomain ? "打開預覽檢查畫面；沒問題就能分享連結。" : "先把網域綁好，最後再確認公開畫面。"}
                        action={hasDeployment && hasVerifiedDomain ? (
                          <NextStepAction {...nextGuide.action} title={`下一步：${nextGuide.title}`} />
                        ) : undefined}
                      />
                    </div>
                  </section>

                  <aside className="quick-summary-panel">
                    <div>
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
                        <h2 className="party-section-title">每次上傳都會留一版</h2>
                        <p className="party-section-copy mt-1 text-sm">上傳錯了也不用怕，可以回到之前的版本。</p>
                      </div>
                    </div>
                    <div className="row-actions justify-start">
                      <PrimaryButton onClick={openGeneratePanel} disabled={isBusy}>
                        <Sparkles className="h-4 w-4" aria-hidden />
                        AI 生成新版
                      </PrimaryButton>
                      <SecondaryButton onClick={() => setPanelMode("upload")} disabled={isBusy}>
                        <Upload className="h-4 w-4" aria-hidden />
                        上傳新版
                      </SecondaryButton>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {deployments.length === 0 ? (
                      <EmptyState title="尚無部署" copy="用 Gemini 生成第一版，或上傳包含根目錄 index.html 的 zip 建立第一個 deployment。" />
                    ) : deployments.map((deployment) => (
                      <div key={deployment.id} className="deployment-row">
                        <div className="min-w-0">
                          <div className="deployment-title-row">
                            <span className="row-version">v{deployment.version}</span>
                            <p className="party-list-title truncate">{deployment.originalName}</p>
                          </div>
                          <p className="party-section-copy text-sm">{deployment.fileCount} 個檔案 · {formatBytes(deployment.totalBytes)} · {dateTime(deployment.createdAt)}</p>
                        </div>
                        {deployment.id === activeSite.activeDeploymentId ? (
                          <span className="row-state row-state-ok">目前上線</span>
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
                      <li>回到總覽按「下一步」驗證，或在下方網域列直接驗證。</li>
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
                        <StatusText status={domain.status} />
                        <div className="row-actions justify-start">
                          <SecondaryButton onClick={() => void handleVerifyDomain(domain.id)} disabled={isBusy}>
                            <RefreshCw className="h-4 w-4" aria-hidden />
                            下一步
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
        description="這一步只需要命名網站。按下一步後會建立空專案，並回到總覽繼續生成第一版或上傳 ZIP。"
        disabled={isBusy}
        onClose={closePanel}
      >
        <form className="party-form-grid" onSubmit={handleCreateSite}>
          <div className="drawer-guide">
            <p className="party-list-title">先取一個好認的名字</p>
            <p className="party-section-copy text-sm">例如公司官網、活動頁、作品集。下一步會建立專案，之後還能再改名。</p>
          </div>
          <TextInput id="site-name" label="網站名稱" value={siteName} onChange={setSiteName} placeholder="marketing-site" required />
          <PrimaryButton type="submit" disabled={isBusy}>
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            下一步
            <ChevronRight className="h-4 w-4" aria-hidden />
          </PrimaryButton>
        </form>
      </Drawer>

      <Drawer
        id="generate-site-drawer"
        open={panelMode === "generate-site"}
        title={activeSite ? (hasDeployment ? "用 Gemini 生成新版" : "用 Gemini 生成第一版") : "用 Gemini 生成網站"}
        description={activeSite ? `這一步只需要描述網站需求。按下一步後，Gemini 會為「${activeSite.name}」生成部署版本並設為 active。` : "這一步只需要描述網站需求。按下一步後，Gemini 會生成靜態網站並自動建立第一個 deployment。"}
        disabled={isBusy}
        onClose={closePanel}
      >
        <form className="party-form-grid" onSubmit={handleGenerateSite}>
          <div className="drawer-guide">
            <p className="party-list-title">{activeSite ? "會覆蓋目前對外版本" : "會建立新網站專案"}</p>
            <p className="party-section-copy text-sm">生成內容會被限制為 HTML 與 CSS，不接受 script 或外部嵌入資源。</p>
          </div>
          {activeSite ? (
            <div className="generation-target">
              <span className="field-label">目標專案</span>
              <p className="party-list-title">{activeSite.name}</p>
              <p className="party-section-copy text-sm">/{activeSite.slug}</p>
            </div>
          ) : (
            <TextInput id="ai-site-name" label="網站名稱" value={aiSiteName} onChange={setAiSiteName} placeholder="例如：品牌形象官網" required />
          )}
          <TextArea
            id="ai-brief"
            label="網站需求"
            value={aiBrief}
            onChange={setAiBrief}
            placeholder="例如：幫我做一個高端室內設計公司的官網，強調住宅設計、商空規劃、預約諮詢與作品案例。"
            required
          />
          <TextInput id="ai-audience" label="目標受眾" value={aiAudience} onChange={setAiAudience} placeholder="例如：準備裝修的家庭、店面業主" />
          <TextInput id="ai-style" label="視覺風格" value={aiStyle} onChange={setAiStyle} placeholder="例如：乾淨、明亮、科技感、精品感" />
          <TextInput id="ai-sections" label="希望區塊" value={aiSections} onChange={setAiSections} placeholder="例如：首頁、服務、流程、案例、常見問題、聯絡" />
          <TextInput id="ai-contact" label="聯絡或 CTA" value={aiContact} onChange={setAiContact} placeholder="例如：預約諮詢、LINE、電話、Email" />
          <PrimaryButton type="submit" disabled={isBusy || !aiBrief.trim() || (!activeSite && !aiSiteName.trim())}>
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            下一步
            <ChevronRight className="h-4 w-4" aria-hidden />
          </PrimaryButton>
        </form>
      </Drawer>

      <Drawer
        id="upload-drawer"
        open={panelMode === "upload" && Boolean(activeSite)}
        title="上傳新版本"
        description="這一步只需要選擇 ZIP。按下一步後會建立 deployment 並自動設為 active。"
        disabled={isBusy}
        onClose={closePanel}
      >
        <form className="party-form-grid" onSubmit={handleUpload}>
          <div className="drawer-guide">
            <p className="party-list-title">ZIP 裡面要有 index.html</p>
            <p className="party-section-copy text-sm">如果網站檔案放在資料夾裡，請先進到資料夾內再打包。下一步會上傳並建立版本。</p>
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
            下一步
            <ChevronRight className="h-4 w-4" aria-hidden />
          </PrimaryButton>
        </form>
      </Drawer>

      <Drawer
        id="add-domain-drawer"
        open={panelMode === "add-domain" && Boolean(activeSite)}
        title="新增網域"
        description={`這一步只需要填公開網址。下一步會新增網域，接著引導你把 DNS CNAME 指向 ${cnameTarget}。`}
        disabled={isBusy}
        onClose={closePanel}
      >
        <form className="party-form-grid" onSubmit={handleAddDomain}>
          <div className="drawer-guide">
            <p className="party-list-title">先填你的公開網址</p>
            <p className="party-section-copy text-sm">新增後回到總覽，下一步會帶你設定 DNS 並驗證：{cnameTarget}</p>
          </div>
          <TextInput id="domain-name" label="自訂網域" value={domainName} onChange={setDomainName} placeholder="www.example.com" required />
          <PrimaryButton type="submit" disabled={isBusy || !domainName}>
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            下一步
            <ChevronRight className="h-4 w-4" aria-hidden />
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
            下一步
            <ChevronRight className="h-4 w-4" aria-hidden />
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
