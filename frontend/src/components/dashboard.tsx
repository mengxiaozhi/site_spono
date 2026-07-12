"use client";

import {
  AlertCircle,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Copy,
  ExternalLink,
  Globe2,
  LayoutDashboard,
  Loader2,
  LogOut,
  MoreVertical,
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
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiRequest, formatBytes, type Deployment, type Domain, type GenerationJob, type Site, type User } from "@/lib/api";
import {
  delay,
  formatDateTime,
  formatShortDateTime,
  getDomainSummary,
  getPublishProgress,
  type AuthMode,
  type DashboardTab,
  type PublishStepStatus,
  type SecondaryPanel
} from "@/components/dashboard/model";
import { prefersReducedMotion, runGsapAnimation, useScopedGsapAnimation } from "@/components/dashboard/motion";
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
        </div>
      )}
    </div>
  );
}

function PublishStep({
  action,
  step,
  state,
  status,
  title
}: {
  action?: ReactNode;
  step: number;
  state: string;
  status: PublishStepStatus;
  title: string;
}) {
  return (
    <div
      className={`publish-step publish-step-${status}`}
      aria-current={status === "current" ? "step" : undefined}
      aria-label={`步驟 ${step}: ${title}`}
    >
      <span className="publish-step-marker" aria-hidden>
        {status === "done" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : null}
      </span>
      <div className="min-w-0">
        <div className="publish-step-heading">{title}</div>
        <p className="publish-step-state">{state}</p>
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
      <span className="next-step-indicator">{icon}</span>
      <div className="next-step-content">
        <h2 className="party-section-title">{title}</h2>
        <p className="party-section-copy text-sm">{copy}</p>
      </div>
      <div className="next-step-actions">
        <NextStepAction {...action} title={`下一步：${title}`} />
      </div>
    </section>
  );
}

function StatusText({ status }: { status: Domain["status"] }) {
  const label = status === "verified" ? "已驗證" : status === "failed" ? "未通過" : "等待驗證";
  const className = status === "verified"
    ? "row-state-ok"
    : status === "failed"
      ? "row-state-danger"
      : "row-state-warning";

  return (
    <span className={`status-inline row-state ${className}`}>
      <span className="status-dot" aria-hidden />
      {label}
    </span>
  );
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

  useScopedGsapAnimation(drawerRef, open, (gsap, root) => {
    gsap.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18, ease: "power2.out" });
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
  }, [open]);

  if (!open) return null;

  function requestClose() {
    if (disabled) return;
    if (!drawerRef.current || prefersReducedMotion()) {
      onClose();
      return;
    }

    const root = drawerRef.current;
    const panel = root.querySelector(".drawer-panel");
    runGsapAnimation((gsap) => {
      gsap.timeline({ onComplete: onClose })
        .to(panel, { xPercent: 100, duration: 0.24, ease: "power2.in" })
        .to(root, { autoAlpha: 0, duration: 0.16, ease: "power2.out" }, 0);
    });
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

  useScopedGsapAnimation(dialogRef, open, (gsap, root) => {
    gsap.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.16, ease: "power2.out" });
    gsap.fromTo(
      ".dialog-panel",
      { autoAlpha: 0, scale: 0.96, y: 10 },
      { autoAlpha: 1, scale: 1, y: 0, duration: 0.26, ease: "power3.out", clearProps: "all" }
    );
  }, [open]);

  if (!open) return null;

  function requestClose() {
    if (disabled) return;
    if (!dialogRef.current || prefersReducedMotion()) {
      onClose();
      return;
    }

    const root = dialogRef.current;
    const panel = root.querySelector(".dialog-panel");
    runGsapAnimation((gsap) => {
      gsap.timeline({ onComplete: onClose })
        .to(panel, { autoAlpha: 0, scale: 0.96, y: 8, duration: 0.16, ease: "power2.in" })
        .to(root, { autoAlpha: 0, duration: 0.14, ease: "power2.out" }, 0);
    });
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
  helper?: string;
}) {
  return (
    <div className="party-stat-box">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="party-kicker">{label}</p>
          <strong>{value}</strong>
          {helper && <p className="party-section-copy mt-2 text-sm">{helper}</p>}
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
  const detailsRequestRef = useRef(0);

  const activeSite = useMemo(
    () => sites.find((site) => site.id === activeSiteId) ?? sites[0] ?? null,
    [activeSiteId, sites]
  );
  const activeDeployment = useMemo(
    () => deployments.find((deployment) => deployment.id === activeSite?.activeDeploymentId) ?? null,
    [activeSite?.activeDeploymentId, deployments]
  );
  const domainSummary = useMemo(() => getDomainSummary(domains), [domains]);
  const verifiedDomains = domainSummary.verifiedCount;
  const unverifiedDomain = domainSummary.firstUnverified;
  const hasDeployment = Boolean(activeDeployment);
  const hasVerifiedDomain = verifiedDomains > 0;
  const publishProgress = getPublishProgress(activeSite, hasDeployment, hasVerifiedDomain);
  const guideTotal = publishProgress.totalSteps;
  const currentGuideStep = publishProgress.currentStep;
  const completedGuideSteps = publishProgress.completedSteps;

  function clearSessionState(nextMessage = "登入狀態已失效，請重新登入") {
    setUser(null);
    setSites([]);
    setActiveSiteId(null);
    setDeployments([]);
    setDomains([]);
    setPanelMode(null);
    setDomainPendingDelete(null);
    setUploadFile(null);
    setIsBusy(false);
    setMessage(nextMessage);
  }

  function handleApiError(error: unknown, fallbackMessage: string) {
    if (error instanceof ApiError && error.status === 401) {
      clearSessionState();
      return;
    }
    setMessage(error instanceof Error ? error.message : fallbackMessage);
  }

  useScopedGsapAnimation(rootRef, !isBooting, (gsap) => {
    gsap.fromTo(
      "[data-animate='intro']",
      { autoAlpha: 0, y: 16 },
      { autoAlpha: 1, y: 0, duration: 0.46, stagger: 0.06, ease: "power3.out", clearProps: "all" }
    );
  }, [isBooting, Boolean(user)]);

  useScopedGsapAnimation(rootRef, Boolean(user) && !isBooting, (gsap) => {
    gsap.fromTo(
      "[data-animate='tab-panel']",
      { autoAlpha: 0, y: 12 },
      { autoAlpha: 1, y: 0, duration: 0.32, ease: "power2.out", clearProps: "all" }
    );
  }, [activeSite?.id, activeTab, isBooting, Boolean(user)]);

  useScopedGsapAnimation(rootRef, Boolean(message), (gsap) => {
    gsap.fromTo(
      "[data-animate='toast']",
      { autoAlpha: 0, y: -8 },
      { autoAlpha: 1, y: 0, duration: 0.24, ease: "power2.out", clearProps: "all" }
    );
  }, [message]);

  async function loadSites(nextActiveId?: string) {
    const data = await apiRequest<{ sites: Site[] }>("/api/sites");
    setSites(data.sites);
    setActiveSiteId(nextActiveId ?? data.sites[0]?.id ?? null);
  }

  async function loadDetails(siteId: string) {
    const requestId = detailsRequestRef.current + 1;
    detailsRequestRef.current = requestId;
    const [deploymentData, domainData] = await Promise.all([
      apiRequest<{ deployments: Deployment[] }>(`/api/sites/${siteId}/deployments`),
      apiRequest<{ domains: Domain[]; cnameTarget: string }>(`/api/sites/${siteId}/domains`)
    ]);
    if (requestId !== detailsRequestRef.current) return;
    setDeployments(deploymentData.deployments);
    setDomains(domainData.domains);
    setCnameTarget(domainData.cnameTarget);
  }

  async function waitForGenerationJob(jobId: string) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const data = await apiRequest<{
        job: GenerationJob;
        site?: Site;
        deployment?: Deployment;
        generated?: { siteName: string | null; summary: string | null };
      }>(`/api/generation-jobs/${jobId}`);

      if (data.job.status === "succeeded") {
        if (!data.site || !data.deployment) {
          throw new Error("Gemini 已完成，但找不到部署結果");
        }
        return {
          site: data.site,
          deployment: data.deployment,
          generated: data.generated || data.job.generated
        };
      }

      if (data.job.status === "failed") {
        throw new Error(data.job.error || "Gemini 生成失敗");
      }

      await delay(1500);
    }

    throw new Error("Gemini 仍在生成中，請稍後重新整理查看結果");
  }

  async function bootstrap() {
    setIsBooting(true);
    try {
      const [demoResult, data] = await Promise.all([
        apiRequest<{ enabled: boolean }>("/api/demo/status").catch(() => ({ enabled: false })),
        apiRequest<{ user: User | null }>("/api/auth/me")
      ]);
      setDemoEnabled(demoResult.enabled);
      setUser(data.user);
      if (data.user) {
        await loadSites();
      }
    } catch (error) {
      handleApiError(error, "無法連線到後端");
    } finally {
      setIsBooting(false);
    }
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!activeSite) {
      detailsRequestRef.current += 1;
      setDeployments([]);
      setDomains([]);
      setSiteSettingsName("");
      return;
    }
    setSiteSettingsName(activeSite.name);
    void loadDetails(activeSite.id).catch((error) => handleApiError(error, "讀取網站資料失敗"));
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
      handleApiError(error, "建立網站失敗");
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
      const started = await apiRequest<{
        job: GenerationJob;
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
      setMessage("Gemini 正在生成，完成後會自動建立部署版本");
      const data = await waitForGenerationJob(started.job.id);
      setAiBrief("");
      setAiAudience("");
      setAiStyle("");
      setAiSections("");
      setAiContact("");
      if (!activeSite) setAiSiteName("");
      setPanelMode(null);
      if (activeSite) {
        await Promise.all([loadSites(data.site.id), loadDetails(data.site.id)]);
      } else {
        await loadSites(data.site.id);
      }
      setActiveTab("overview");
      setMessage(`Gemini 已生成 v${data.deployment.version}，下一步請設定網域：${data.generated.summary || "已建立部署版本"}`);
    } catch (error) {
      handleApiError(error, "Gemini 生成失敗");
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
      await Promise.all([loadSites(data.site.id), loadDetails(data.site.id)]);
      setActiveTab("overview");
      setMessage(`部署 v${data.deployment.version} 已啟用，下一步請設定網域`);
    } catch (error) {
      handleApiError(error, "上傳失敗");
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
      await Promise.all([loadSites(activeSite.id), loadDetails(activeSite.id)]);
      setMessage("部署版本已切換");
    } catch (error) {
      handleApiError(error, "切換版本失敗");
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
      handleApiError(error, "新增網域失敗");
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
      handleApiError(error, "驗證失敗");
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
      handleApiError(error, "移除網域失敗");
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
      handleApiError(error, "更新網站失敗");
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
      handleApiError(error, "刪除網站失敗");
    } finally {
      setIsBusy(false);
    }
  }

  const workflowSteps = [
    { key: "site", label: "建立網站", status: activeSite ? "done" : "current" },
    { key: "deploy", label: "部署版本", status: stepStatus(hasDeployment, currentGuideStep === 2) },
    { key: "domain", label: "綁定網域", status: stepStatus(hasVerifiedDomain, currentGuideStep === 3) },
    { key: "preview", label: "完成", status: hasDeployment && hasVerifiedDomain ? "current" : "todo" }
  ] satisfies Array<{ key: string; label: string; status: PublishStepStatus }>;

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
                <p className="party-hero-lead mt-4">登入後可生成網站、上傳 ZIP、綁定網域並預覽。</p>
              </div>
            </div>

            <div className="auth-guide-list">
              <div className="health-row">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-[#0b9ee8]" aria-hidden />
                <div>
                  <p className="party-list-title">1. 登入或建立帳號</p>
                </div>
              </div>
              <div className="health-row">
                <Sparkles className="mt-0.5 h-5 w-5 text-[#0b9ee8]" aria-hidden />
                <div>
                  <p className="party-list-title">2. Gemini 生成第一版</p>
                </div>
              </div>
              <div className="health-row">
                <Upload className="mt-0.5 h-5 w-5 text-[#0b9ee8]" aria-hidden />
                <div>
                  <p className="party-list-title">3. 需要時上傳 ZIP</p>
                </div>
              </div>
              <div className="health-row">
                <Globe2 className="mt-0.5 h-5 w-5 text-[#0b9ee8]" aria-hidden />
                <div>
                  <p className="party-list-title">4. 綁定網域並預覽</p>
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
    <main ref={rootRef} className="app-shell">
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
            <a className="utility-link hidden md:inline-flex" href={activeSite?.previewUrl ?? "#"} onClick={(event) => {
              if (!activeSite) event.preventDefault();
            }} target="_blank" rel="noreferrer">
              <BookOpen className="h-4 w-4" aria-hidden />
              文件
            </a>
            <span className="utility-link hidden md:inline-flex">
              <CircleHelp className="h-4 w-4" aria-hidden />
              幫助
            </span>
            <IconButton label="通知">
              <Bell className="h-4 w-4" aria-hidden />
            </IconButton>
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
            <h2 className="rail-title">我的網站</h2>
            <div className="rail-header-actions">
              <button type="button" className="rail-create-button" onClick={() => setPanelMode("create-site")} disabled={isBusy}>
                <Plus className="h-4 w-4" aria-hidden />
                新增網站
              </button>
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
                <MonitorPlay className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{site.name}</span>
                </span>
                <span className={`project-dot ${site.activeDeploymentId ? "project-dot-live" : ""}`} aria-hidden />
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
            <section className="empty-workbench" data-animate="tab-panel">
              <div>
                <h1 className="party-hero-title">建立網站專案</h1>
                <p className="party-hero-lead mt-3">用 Gemini 生成第一版，或先建立空專案。</p>
                <div className="row-actions justify-start mt-6">
                  <PrimaryButton onClick={openGeneratePanel} disabled={isBusy}>
                    <Sparkles className="h-4 w-4" aria-hidden />
                    AI 生成
                  </PrimaryButton>
                  <SecondaryButton onClick={() => setPanelMode("create-site")} disabled={isBusy}>
                    <Plus className="h-4 w-4" aria-hidden />
                    新增網站
                  </SecondaryButton>
                </div>
              </div>
            </section>
          ) : (
            <>
              <section className="site-command-bar" data-animate="intro">
                <div className="site-command-main">
                  <div className="site-title-row">
                    <span className="site-icon">
                      <MonitorPlay className="h-7 w-7" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <div className="site-title-stack">
                        <h1 className="party-hero-title truncate">{activeSite.name}</h1>
                        <span className={`site-state-text ${activeDeployment ? "site-state-ok" : "site-state-warning"}`}>
                          <span className="status-dot" aria-hidden />
                          {activeDeployment ? "已上線" : "待上傳"}
                        </span>
                      </div>
                      <a href={activeSite.previewUrl} target="_blank" rel="noreferrer" className="site-preview-link">
                        {activeSite.previewUrl}
                        <ExternalLink className="h-4 w-4" aria-hidden />
                      </a>
                    </div>
                  </div>

                  <div className="site-meta-row">
                    <span>版本 {activeDeployment ? `v${activeDeployment.version}` : "-"}</span>
                    <span>最新部署 {activeDeployment ? formatDateTime(activeDeployment.createdAt) : "-"}</span>
                    <span>網站大小 {activeDeployment ? formatBytes(activeDeployment.totalBytes) : "-"}</span>
                  </div>
                </div>

                <div className="site-command-actions">
                  <PrimaryButton onClick={openGeneratePanel} disabled={isBusy}>
                    <Sparkles className="h-4 w-4" aria-hidden />
                    AI 生成
                  </PrimaryButton>
                  <SecondaryButton onClick={() => setPanelMode("upload")} disabled={isBusy}>
                    <Upload className="h-4 w-4" aria-hidden />
                    上傳 ZIP
                  </SecondaryButton>
                  <a href={activeSite.previewUrl} target="_blank" rel="noreferrer" className="btn-secondary">
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    開啟預覽
                  </a>
                  <IconButton label="複製 Preview URL" onClick={() => void copyText(activeSite.previewUrl, "Preview URL 已複製")}>
                    <Copy className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <IconButton label="更多操作">
                    <MoreVertical className="h-4 w-4" aria-hidden />
                  </IconButton>
                </div>
              </section>

              <nav className="workflow-line" aria-label={`完成進度 ${completedGuideSteps} / ${guideTotal}`} data-animate="intro">
                {workflowSteps.map((step) => (
                  <div key={step.key} className={`workflow-step workflow-step-${step.status}`}>
                    <span className="workflow-marker" aria-hidden>
                      {step.status === "done" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : null}
                    </span>
                    <span>{step.label}</span>
                  </div>
                ))}
              </nav>

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
                <section className="operations-grid" data-animate="tab-panel">
                  <section className="operations-panel deployments-panel">
                    <div className="section-toolbar">
                      <h2 className="party-section-title">部署紀錄</h2>
                      <button type="button" className="text-action" onClick={() => setActiveTab("deployments")}>
                        查看所有版本
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </button>
                    </div>

                    {deployments.length === 0 ? (
                      <EmptyState title="尚無部署" copy="用 Gemini 生成，或上傳包含 index.html 的 ZIP。" />
                    ) : (
                      <div className="data-table deployment-table">
                        <div className="data-table-head">
                          <span>版本</span>
                          <span>部署時間</span>
                          <span>來源</span>
                          <span>大小</span>
                          <span>操作</span>
                        </div>
                        {deployments.map((deployment) => (
                          <div key={deployment.id} className="data-table-row">
                            <span className="row-version">v{deployment.version}</span>
                            <span>{formatDateTime(deployment.createdAt)}</span>
                            <span>{deployment.originalName.toLowerCase().includes("gemini") ? "AI 生成" : "上傳 ZIP"}</span>
                            <span>{formatBytes(deployment.totalBytes)}</span>
                            <span className="table-actions">
                              {deployment.id === activeSite.activeDeploymentId ? (
                                <span className="row-state row-state-ok">
                                  <span className="status-dot" aria-hidden />
                                  目前上線
                                </span>
                              ) : (
                                <button type="button" className="text-action" onClick={() => void handleActivate(deployment.id)} disabled={isBusy}>
                                  回滾
                                </button>
                              )}
                              <IconButton label={`v${deployment.version} 更多操作`}>
                                <MoreVertical className="h-4 w-4" aria-hidden />
                              </IconButton>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <aside className="operations-panel domain-panel">
                    <div className="section-toolbar">
                      <h2 className="party-section-title">網域設定</h2>
                      <button type="button" className="text-action" onClick={() => setPanelMode("add-domain")} disabled={isBusy}>
                        新增網域
                      </button>
                    </div>

                    <div className="domain-target">
                      <span className="field-label">CNAME 目標</span>
                      <div className="code-row">
                        <code className="truncate font-mono text-sm">{cnameTarget}</code>
                        <IconButton label="複製 CNAME target" onClick={() => void copyText(cnameTarget, "CNAME target 已複製")}>
                          <Copy className="h-4 w-4" aria-hidden />
                        </IconButton>
                      </div>
                    </div>

                    <div className="domain-list">
                      <div className="domain-list-heading">已綁定網域</div>
                      {domains.length === 0 ? (
                        <p className="party-section-copy text-sm">尚未綁定任何網域</p>
                      ) : domains.map((domain) => (
                        <div key={domain.id} className="domain-line">
                          <div className="min-w-0">
                            <p className="party-list-title truncate">{domain.hostname}</p>
                            <p className="party-section-copy text-xs">最後驗證 {formatShortDateTime(domain.lastCheckedAt)}</p>
                            {domain.lastError && <p className="mt-1 text-sm text-[#b3261e]">{domain.lastError}</p>}
                          </div>
                          <StatusText status={domain.status} />
                          <IconButton label={`驗證 ${domain.hostname}`} onClick={() => void handleVerifyDomain(domain.id)} disabled={isBusy}>
                            <ExternalLink className="h-4 w-4" aria-hidden />
                          </IconButton>
                          <IconButton label={`移除 ${domain.hostname}`} onClick={() => setDomainPendingDelete(domain)} disabled={isBusy}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </IconButton>
                        </div>
                      ))}
                    </div>
                  </aside>
                </section>
              )}

              {activeTab === "deployments" && (
                <section className="operations-panel" data-animate="tab-panel">
                  <div className="section-toolbar">
                    <h2 className="party-section-title">部署紀錄</h2>
                    <div className="row-actions justify-start">
                      <PrimaryButton onClick={openGeneratePanel} disabled={isBusy}>
                        <Sparkles className="h-4 w-4" aria-hidden />
                        AI 生成
                      </PrimaryButton>
                      <SecondaryButton onClick={() => setPanelMode("upload")} disabled={isBusy}>
                        <Upload className="h-4 w-4" aria-hidden />
                        上傳 ZIP
                      </SecondaryButton>
                    </div>
                  </div>

                  {deployments.length === 0 ? (
                    <EmptyState title="尚無部署" copy="用 Gemini 生成，或上傳包含 index.html 的 ZIP。" />
                  ) : (
                    <div className="data-table deployment-table deployment-table-wide">
                      <div className="data-table-head">
                        <span>版本</span>
                        <span>部署時間</span>
                        <span>來源</span>
                        <span>檔案</span>
                        <span>大小</span>
                        <span>操作</span>
                      </div>
                      {deployments.map((deployment) => (
                        <div key={deployment.id} className="data-table-row">
                          <span className="row-version">v{deployment.version}</span>
                          <span>{formatDateTime(deployment.createdAt)}</span>
                          <span>{deployment.originalName.toLowerCase().includes("gemini") ? "AI 生成" : "上傳 ZIP"}</span>
                          <span>{deployment.fileCount}</span>
                          <span>{formatBytes(deployment.totalBytes)}</span>
                          <span className="table-actions">
                            {deployment.id === activeSite.activeDeploymentId ? (
                              <span className="row-state row-state-ok">
                                <span className="status-dot" aria-hidden />
                                目前上線
                              </span>
                            ) : (
                              <SecondaryButton onClick={() => void handleActivate(deployment.id)} disabled={isBusy}>
                                <RotateCcw className="h-4 w-4" aria-hidden />
                                回滾
                              </SecondaryButton>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeTab === "domains" && (
                <section className="operations-panel" data-animate="tab-panel">
                  <div className="section-toolbar">
                    <h2 className="party-section-title">網域設定</h2>
                    <PrimaryButton onClick={() => setPanelMode("add-domain")} disabled={isBusy}>
                      <Plus className="h-4 w-4" aria-hidden />
                      新增網域
                    </PrimaryButton>
                  </div>

                  <div className="domain-target domain-target-wide">
                    <span className="field-label">CNAME 目標</span>
                    <div className="code-row">
                      <code className="truncate font-mono text-sm">{cnameTarget}</code>
                      <IconButton label="複製 CNAME target" onClick={() => void copyText(cnameTarget, "CNAME target 已複製")}>
                        <Copy className="h-4 w-4" aria-hidden />
                      </IconButton>
                    </div>
                  </div>

                  <div className="data-table domain-table">
                    <div className="data-table-head">
                      <span>網域</span>
                      <span>狀態</span>
                      <span>最後驗證</span>
                      <span>操作</span>
                    </div>
                    {domains.length === 0 ? (
                      <div className="data-table-row data-table-empty">
                        <span>尚無自訂網域</span>
                      </div>
                    ) : domains.map((domain) => (
                      <div key={domain.id} className="data-table-row">
                        <span className="truncate">{domain.hostname}</span>
                        <StatusText status={domain.status} />
                        <span>{formatShortDateTime(domain.lastCheckedAt)}</span>
                        <span className="table-actions">
                          <SecondaryButton onClick={() => void handleVerifyDomain(domain.id)} disabled={isBusy}>
                            <RefreshCw className="h-4 w-4" aria-hidden />
                            驗證
                          </SecondaryButton>
                          <IconButton label={`移除 ${domain.hostname}`} onClick={() => setDomainPendingDelete(domain)} disabled={isBusy}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </IconButton>
                        </span>
                        {domain.lastError && <p className="domain-error">{domain.lastError}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {activeTab === "settings" && (
                <section className="operations-panel" data-animate="tab-panel">
                  <div className="section-toolbar">
                    <h2 className="party-section-title">設定</h2>
                  </div>

                  <div className="settings-list">
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
                    <div className="settings-row settings-row-danger">
                      <div>
                        <p className="party-list-title text-[#b3261e]">刪除網站</p>
                        <p className="party-section-copy text-sm">移除網站、部署版本與網域設定。</p>
                      </div>
                      <DangerButton onClick={() => setPanelMode("delete-site")} disabled={isBusy}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                        刪除網站
                      </DangerButton>
                    </div>
                  </div>
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
        description="命名網站後會建立空專案。"
        disabled={isBusy}
        onClose={closePanel}
      >
        <form className="party-form-grid" onSubmit={handleCreateSite}>
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
        description={activeSite ? `描述需求後會為「${activeSite.name}」建立部署版本。` : "描述需求後會建立網站與第一個部署版本。"}
        disabled={isBusy}
        onClose={closePanel}
      >
        <form className="party-form-grid" onSubmit={handleGenerateSite}>
          <div className="drawer-guide">
            輸出限制：HTML/CSS，不包含 script 或外部嵌入資源。
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
        description="選擇 ZIP 後會建立部署版本。"
        disabled={isBusy}
        onClose={closePanel}
      >
        <form className="party-form-grid" onSubmit={handleUpload}>
          <div className="drawer-guide">
            ZIP 需包含 index.html；網站檔案請放在 ZIP 根目錄。
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
        description="填入公開網址後再設定 CNAME。"
        disabled={isBusy}
        onClose={closePanel}
      >
        <form className="party-form-grid" onSubmit={handleAddDomain}>
          <div className="drawer-guide">
            CNAME target：{cnameTarget}
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
        description="只更新控制台名稱，不改變 slug、部署或網域。"
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
