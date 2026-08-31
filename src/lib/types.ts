export type MailSource = "local" | "r2";

export interface Address {
  name: string;
  address: string;
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  cid?: string;
  inline: boolean;
}

export interface MessageSummary {
  id: string;
  source: MailSource;
  filename: string;
  messageId: string;
  inReplyTo?: string;
  references: string[];
  from: Address;
  to: Address[];
  cc: Address[];
  subject: string;
  date: string;
  snippet: string;
  hasHtml: boolean;
  hasText: boolean;
  hasAttachments: boolean;
  attachmentCount: number;
  threadId: string;
  searchText: string;
}

export interface ParsedMessage extends MessageSummary {
  html?: string;
  text?: string;
  attachments: AttachmentMeta[];
}

export interface ThreadSummary {
  id: string;
  subject: string;
  snippet: string;
  date: string;
  from: Address;
  participants: Address[];
  messageCount: number;
  hasAttachments: boolean;
  hasUnread?: boolean;
  messages: MessageSummary[];
}

export interface SenderFacet {
  address: string;
  name: string;
  count: number;
}

export interface DomainFacet {
  domain: string;
  count: number;
}

export interface MailboxPayload {
  source: MailSource | "both";
  messageCount: number;
  threadCount: number;
  threads: ThreadSummary[];
  messages: MessageSummary[];
  senders: SenderFacet[];
  domains: DomainFacet[];
}

export interface MailFilters {
  query: string;
  hasAttachment: boolean;
  from: string;
  domain: string;
  after: string;
  before: string;
  unreadOnly: boolean;
  nav: "all" | "unread" | "attachments" | "domain";
}
