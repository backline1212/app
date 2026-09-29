import clickupLogo from "../../assets/icons/clickup-svgrepo-com.svg";
import slackLogo from "../../assets/icons/slack-svgrepo-com.svg";
import trelloLogo from "../../assets/icons/trello-color-svgrepo-com.svg";
import type { IntegrationCreate, IntegrationType } from "./api";

export type ProviderKind = "notifier" | "tracker";

export interface ProviderField {
  name: string;
  label: string;
  placeholder?: string;
  type?: "text" | "password" | "url" | "email";
  optional?: boolean;
  defaultValue?: string;
}

export interface NotifyToggles {
  notify_status_changes: boolean;
  notify_team_layer: boolean;
  notify_project_updates: boolean;
}

export interface Provider {
  type: IntegrationType;
  name: string;
  kind: ProviderKind;
  /** Brand color behind the initial when there's no logo asset. */
  color: string;
  logo?: string;
  blurb: string;
  /** What a tracker files tickets into, e.g. "list" or "repository". */
  destinationNoun?: string;
  fields: ProviderField[];
  /** Where to get the credential, as numbered steps. */
  steps: string[];
  helpUrl: string;
  helpLabel: string;
  /** Can also connect through the operator's OAuth app, when one is configured. */
  oauth?: boolean;
  toBody: (values: Record<string, string>, toggles: NotifyToggles) => IntegrationCreate;
}

const text = (values: Record<string, string>, name: string) => (values[name] ?? "").trim();
const optional = (values: Record<string, string>, name: string) => text(values, name) || null;

export const PROVIDERS: Provider[] = [
  {
    type: "slack",
    name: "Slack",
    kind: "notifier",
    color: "#4A154B",
    logo: slackLogo,
    blurb: "Post new comments, replies and status changes to a channel.",
    fields: [
      { name: "webhook_url", label: "Incoming webhook URL", type: "url", placeholder: "https://hooks.slack.com/services/..." },
    ],
    steps: [
      "Open api.slack.com/apps and create an app (From scratch) in your workspace.",
      "Turn on Incoming Webhooks, then Add New Webhook to Workspace and pick the channel.",
      "Copy the webhook URL and paste it here.",
    ],
    helpUrl: "https://api.slack.com/messaging/webhooks",
    helpLabel: "Slack's webhook guide",
    toBody: (values, toggles) => ({ type: "slack", webhook_url: text(values, "webhook_url"), ...toggles }),
  },
  {
    type: "discord",
    name: "Discord",
    kind: "notifier",
    color: "#5865F2",
    blurb: "Post new comments, replies and status changes to a channel.",
    fields: [
      { name: "webhook_url", label: "Channel webhook URL", type: "url", placeholder: "https://discord.com/api/webhooks/..." },
    ],
    steps: [
      "In Discord, open the channel's settings (Edit Channel) → Integrations → Webhooks.",
      "Choose New Webhook, then Copy Webhook URL.",
    ],
    helpUrl: "https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks",
    helpLabel: "Discord's webhook guide",
    toBody: (values, toggles) => ({ type: "discord", webhook_url: text(values, "webhook_url"), ...toggles }),
  },
  {
    type: "teams",
    name: "Microsoft Teams",
    kind: "notifier",
    color: "#5059C9",
    blurb: "Post comment cards to a Teams channel through a Workflows webhook.",
    fields: [
      { name: "webhook_url", label: "Workflow webhook URL", type: "url", placeholder: "https://...logic.azure.com/workflows/..." },
    ],
    steps: [
      "In the Teams channel, open ⋯ → Workflows.",
      "Choose the template “Post to a channel when a webhook request is received”, pick the team and channel.",
      "Copy the URL the workflow shows at the end.",
    ],
    helpUrl:
      "https://support.microsoft.com/en-us/office/create-incoming-webhooks-with-workflows-for-microsoft-teams-8ae491c7-0394-4861-ba59-055e33f75498",
    helpLabel: "Microsoft's Workflows guide",
    toBody: (values, toggles) => ({ type: "teams", webhook_url: text(values, "webhook_url"), ...toggles }),
  },
  {
    type: "webhook",
    name: "Webhook",
    kind: "notifier",
    color: "#2F3437",
    blurb: "Signed JSON events for Zapier, Make, n8n or your own endpoint.",
    fields: [
      { name: "url", label: "HTTPS endpoint", type: "url", placeholder: "https://hooks.zapier.com/hooks/catch/..." },
      {
        name: "secret",
        label: "Signing secret",
        type: "password",
        optional: true,
        placeholder: "Leave empty to generate one",
      },
    ],
    steps: [
      "Create a catching webhook: Zapier “Webhooks by Zapier → Catch Hook”, Make “Custom webhook”, an n8n “Webhook” node, or your own HTTPS route.",
      "Paste its URL here. Events arrive as JSON POSTs: comment.created, reply.created, comment.status_changed, project.updated.",
      "To verify one, compute HMAC-SHA256 of “<X-Backline-Timestamp>.<raw body>” with the signing secret and compare it with X-Backline-Signature (sha256=…).",
    ],
    helpUrl: "https://zapier.com/apps/webhook/integrations",
    helpLabel: "Webhooks by Zapier",
    toBody: (values, toggles) => ({
      type: "webhook",
      url: text(values, "url"),
      secret: optional(values, "secret"),
      ...toggles,
    }),
  },
  {
    type: "jira",
    name: "Jira",
    kind: "tracker",
    color: "#0052CC",
    blurb: "File comments as Jira issues, with the screenshot attached.",
    destinationNoun: "project",
    oauth: true,
    fields: [
      { name: "site_url", label: "Jira site", type: "url", placeholder: "https://your-team.atlassian.net" },
      { name: "email", label: "Your Atlassian email", type: "email", placeholder: "you@agency.com" },
      { name: "api_token", label: "API token", type: "password" },
    ],
    steps: [
      "Open id.atlassian.com/manage-profile/security/api-tokens and choose Create API token.",
      "Copy the token, and enter it with the email you sign in to Jira with and your site address.",
    ],
    helpUrl: "https://id.atlassian.com/manage-profile/security/api-tokens",
    helpLabel: "Create a Jira API token",
    toBody: (values) => ({
      type: "jira",
      site_url: text(values, "site_url"),
      email: text(values, "email"),
      api_token: text(values, "api_token"),
    }),
  },
  {
    type: "linear",
    name: "Linear",
    kind: "tracker",
    color: "#5E6AD2",
    blurb: "File comments as Linear issues, with the screenshot embedded.",
    destinationNoun: "team",
    fields: [{ name: "api_key", label: "Personal API key", type: "password", placeholder: "lin_api_..." }],
    steps: [
      "In Linear, open Settings → Account → Security & access.",
      "Under Personal API keys choose New key, then copy it.",
    ],
    helpUrl: "https://linear.app/settings/account/security",
    helpLabel: "Linear API keys",
    toBody: (values) => ({ type: "linear", api_key: text(values, "api_key") }),
  },
  {
    type: "github",
    name: "GitHub",
    kind: "tracker",
    color: "#24292F",
    blurb: "File comments as GitHub issues, linked back to the pin in Backline.",
    destinationNoun: "repository",
    fields: [{ name: "token", label: "Personal access token", type: "password", placeholder: "github_pat_..." }],
    steps: [
      "Open github.com/settings/personal-access-tokens/new (fine-grained token).",
      "Pick the repositories, and under Repository permissions set Issues to “Read and write”.",
      "Generate and copy the token. A classic token with the repo scope also works.",
    ],
    helpUrl: "https://github.com/settings/personal-access-tokens/new",
    helpLabel: "Create a GitHub token",
    toBody: (values) => ({ type: "github", token: text(values, "token") }),
  },
  {
    type: "gitlab",
    name: "GitLab",
    kind: "tracker",
    color: "#FC6D26",
    blurb: "File comments as GitLab issues on gitlab.com or your own instance.",
    destinationNoun: "project",
    fields: [
      { name: "base_url", label: "GitLab URL", type: "url", defaultValue: "https://gitlab.com" },
      { name: "token", label: "Access token (api scope)", type: "password", placeholder: "glpat-..." },
    ],
    steps: [
      "In GitLab, open your avatar → Edit profile → Access tokens → Add new token.",
      "Select the api scope, create it and copy the token.",
      "Self-managed GitLab: replace the URL with your instance's address.",
    ],
    helpUrl: "https://gitlab.com/-/user_settings/personal_access_tokens",
    helpLabel: "Create a GitLab token",
    toBody: (values) => ({
      type: "gitlab",
      base_url: text(values, "base_url") || "https://gitlab.com",
      token: text(values, "token"),
    }),
  },
  {
    type: "asana",
    name: "Asana",
    kind: "tracker",
    color: "#F06A6A",
    blurb: "File comments as Asana tasks, with the screenshot attached.",
    destinationNoun: "project",
    oauth: true,
    fields: [{ name: "access_token", label: "Personal access token", type: "password" }],
    steps: [
      "Open app.asana.com/0/my-apps and choose Create new token.",
      "Name it “Backline”, accept the terms and copy the token.",
    ],
    helpUrl: "https://app.asana.com/0/my-apps",
    helpLabel: "Asana developer console",
    toBody: (values) => ({ type: "asana", access_token: text(values, "access_token") }),
  },
  {
    type: "clickup",
    name: "ClickUp",
    kind: "tracker",
    color: "#7B68EE",
    logo: clickupLogo,
    blurb: "File comments as ClickUp tasks, with the screenshot attached.",
    destinationNoun: "list",
    oauth: true,
    fields: [{ name: "api_token", label: "Personal API token", type: "password", placeholder: "pk_..." }],
    steps: [
      "In ClickUp, open your avatar → Settings → Apps.",
      "Under API Token choose Generate (or Copy), it starts with pk_.",
    ],
    helpUrl: "https://developer.clickup.com/docs/authentication#personal-token",
    helpLabel: "ClickUp personal tokens",
    toBody: (values) => ({ type: "clickup", api_token: text(values, "api_token") }),
  },
  {
    type: "trello",
    name: "Trello",
    kind: "tracker",
    color: "#0079BF",
    logo: trelloLogo,
    blurb: "File comments as Trello cards, with the screenshot attached.",
    destinationNoun: "list",
    fields: [
      { name: "api_key", label: "API key", type: "text" },
      { name: "token", label: "Token", type: "password" },
    ],
    steps: [
      "Open trello.com/power-ups/admin, create a Power-Up (any name) and open its API key tab.",
      "Generate a new API key and copy it.",
      "Click the Token link next to the key, choose Allow, and copy the token.",
    ],
    helpUrl: "https://trello.com/power-ups/admin",
    helpLabel: "Trello Power-Up admin",
    toBody: (values) => ({ type: "trello", api_key: text(values, "api_key"), token: text(values, "token") }),
  },
];

export const PROVIDER_BY_TYPE = new Map(PROVIDERS.map((provider) => [provider.type, provider]));

export function providerName(type: IntegrationType): string {
  return PROVIDER_BY_TYPE.get(type)?.name ?? type;
}

export const DEFAULT_TOGGLES: NotifyToggles = {
  notify_status_changes: true,
  notify_team_layer: false,
  notify_project_updates: true,
};
