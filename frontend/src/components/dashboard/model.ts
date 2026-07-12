import type { Domain, Site } from "@/lib/api";

export type AuthMode = "login" | "register";
export type DashboardTab = "overview" | "deployments" | "domains" | "settings";
export type SecondaryPanel =
  | "create-site"
  | "generate-site"
  | "upload"
  | "add-domain"
  | "rename-site"
  | "delete-site"
  | null;
export type PublishStepStatus = "done" | "current" | "todo";

const fullDateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});

const shortDateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});

export function formatDateTime(value: string | null) {
  return value ? fullDateTimeFormatter.format(new Date(value)) : "-";
}

export function formatShortDateTime(value: string | null) {
  return value ? shortDateTimeFormatter.format(new Date(value)) : "-";
}

export function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function getDomainSummary(domains: Domain[]) {
  let verifiedCount = 0;
  let firstUnverified: Domain | null = null;

  for (const domain of domains) {
    if (domain.status === "verified") {
      verifiedCount += 1;
    } else if (!firstUnverified) {
      firstUnverified = domain;
    }
  }

  return { verifiedCount, firstUnverified };
}

export function getPublishProgress(site: Site | null, hasDeployment: boolean, hasVerifiedDomain: boolean) {
  const currentStep = !site ? 1 : !hasDeployment ? 2 : !hasVerifiedDomain ? 3 : 4;
  const completedSteps =
    (site ? 1 : 0) +
    (hasDeployment ? 1 : 0) +
    (hasVerifiedDomain ? 1 : 0) +
    (hasDeployment && hasVerifiedDomain ? 1 : 0);

  return { currentStep, completedSteps, totalSteps: 4 };
}
