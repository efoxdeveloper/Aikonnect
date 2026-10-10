type TemplateVariable = { source: "contact" | "custom" | "constant"; field: string; fallback: string };
type TemplateContact = {
  id: string;
  name: string;
  phoneE164: string;
  email: string | null;
  source: string;
  status: string;
  customAttributes: unknown;
};

const placeholders = /\{\{\s*\d+\s*\}\}/;

function hasPlaceholder(value: unknown) {
  return typeof value === "string" && placeholders.test(value);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function requiredCampaignCarouselMediaCount(templateType: string, contentValue: unknown): number | null {
  if (templateType !== "carousel") return null;
  const content = record(contentValue);
  if (Array.isArray(content.carouselCards)) return content.carouselCards.length || null;
  const components = Array.isArray(content.metaComponents) ? content.metaComponents.map(record) : [];
  const carousel = components.find((component) => component.type === "CAROUSEL");
  return Array.isArray(carousel?.cards) && carousel.cards.length ? carousel.cards.length : null;
}

/** Returns requirements that the campaign sender currently cannot populate. */
export function unsupportedCampaignTemplateRequirement(input: { category: string; templateType?: string; headerText?: string | null; content: unknown }): string | null {
  if (input.category.toUpperCase() === "AUTHENTICATION") {
    return "Authentication templates require a one-time code parameter and cannot be sent as campaigns.";
  }
  if (input.templateType === "multi-product") {
    return "Multi-product templates require catalog parameters that campaigns cannot provide.";
  }
  if (hasPlaceholder(input.headerText)) {
    return "This template has a variable in its text header. Campaigns currently support variables in the message body only.";
  }

  const content = record(input.content);
  if (Array.isArray(content.buttons) && content.buttons.some((button) => typeof button === "string" && button.toLowerCase() === "flow")) {
    return "This template has a Flow button that requires a per-recipient Flow parameter.";
  }
  if (hasPlaceholder(content.websiteUrl)) {
    return "This template has a variable in its website button URL. Campaigns cannot provide that button value yet.";
  }
  const inspect = (value: unknown, insideCarousel = false): string | null => {
    if (Array.isArray(value)) {
      for (const item of value) {
        const issue = inspect(item, insideCarousel);
        if (issue) return issue;
      }
      return null;
    }
    if (!value || typeof value !== "object") return null;
    const component = record(value);
    const type = typeof component.type === "string" ? component.type.toUpperCase() : "";
    if (type === "HEADER" && component.format === "TEXT" && hasPlaceholder(component.text)) {
      return "This template has a variable in its text header. Campaigns currently support variables in the message body only.";
    }
    if (type === "HEADER" && component.format === "LOCATION") {
      return "This template requires a location header, which campaigns cannot provide.";
    }
    if (insideCarousel && type === "BODY" && hasPlaceholder(component.text)) {
      return "This carousel has card-specific variables that campaigns cannot provide.";
    }
    if (type === "FLOW") return "This template has a Flow button that requires a per-recipient Flow parameter.";
    if (type === "MPM") return "This template requires product catalog parameters that campaigns cannot provide.";
    if (type === "URL" && hasPlaceholder(component.url)) {
      return "This template has a variable in its website button URL. Campaigns cannot provide that button value yet.";
    }
    const nestedCarousel = insideCarousel || type === "CAROUSEL";
    for (const [key, nested] of Object.entries(component)) {
      if (key === "text" || key === "url") continue;
      const issue = inspect(nested, nestedCarousel);
      if (issue) return issue;
    }
    return null;
  };
  return inspect(content.metaComponents);
}

function resolvedValue(variable: TemplateVariable, contact: TemplateContact): string {
  let value: unknown;
  if (variable.source === "constant") value = variable.field || variable.fallback;
  else if (variable.source === "contact") {
    const fields: Record<string, string | null> = {
      name: contact.name,
      phone: contact.phoneE164,
      email: contact.email,
      source: contact.source,
      status: contact.status,
    };
    value = fields[variable.field];
  } else {
    value = record(contact.customAttributes)[variable.field];
  }
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text || variable.fallback.trim();
}

export function missingCampaignTemplateParameters(variables: TemplateVariable[], contacts: TemplateContact[]) {
  const missing = variables.map((variable, index) => ({
    index: index + 1,
    recipientCount: contacts.filter((contact) => !resolvedValue(variable, contact)).length,
  })).filter((item) => item.recipientCount > 0);
  return missing;
}
