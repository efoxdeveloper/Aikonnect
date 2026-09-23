import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy as CopyIcon,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Images,
  LoaderCircle,
  MessageCircle,
  MessageSquareReply,
  Phone,
  Plus,
  Save,
  ShoppingBag,
  Timer,
  Upload,
  Trash2,
  Workflow,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, apiRequest } from "@/lib/api";
import { getActiveMembership } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { toast } from "react-toastify";

type TemplateType = "standard" | "carousel" | "limited" | "multi-product";
type ButtonType = "website" | "offer" | "call" | "quick-reply" | "flow" | "catalog";
type HeaderType = "none" | "text" | "image" | "video" | "doc";
type OtpType = "COPY_CODE" | "ONE_TAP";
type ValidationField = "name" | "language" | "body";
type SaveAction = "draft" | "template";

const templateTypes: Array<{
  id: TemplateType;
  label: string;
  description: string;
  icon: typeof ImageIcon;
}> = [
  { id: "standard", label: "Standard", description: "Text & media", icon: ImageIcon },
  { id: "carousel", label: "Carousel", description: "Multiple cards", icon: Images },
  { id: "limited", label: "Limited time offers", description: "Create urgency", icon: Timer },
  { id: "multi-product", label: "Multi-product", description: "Show catalog items", icon: ShoppingBag },
];

const buttonOptions: Array<{
  id: ButtonType;
  label: string;
  icon: typeof ExternalLink;
}> = [
  { id: "website", label: "Visit Website", icon: ExternalLink },
  { id: "call", label: "Call Phone Number", icon: Phone },
  { id: "quick-reply", label: "Quick replies", icon: MessageSquareReply },
  { id: "flow", label: "Open WhatsApp Flow", icon: Workflow },
  { id: "catalog", label: "View Catalog", icon: ShoppingBag },
  { id: "offer", label: "Copy Offer Code", icon: CopyIcon },
];

const defaultButtonTexts: Record<ButtonType, string> = {
  website: "Visit Website",
  offer: "Copy offer code",
  call: "Call",
  "quick-reply": "Quick reply",
  flow: "Open flow",
  catalog: "View catalog",
};

const headerOptions: Array<{ id: HeaderType; label: string }> = [
  { id: "none", label: "None" },
  { id: "text", label: "Text" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "doc", label: "Doc" },
];

function FieldLabel({
  children,
  htmlFor,
  optional = false,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  optional?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-primary)]"
    >
      {children}
      {optional && (
        <span className="font-normal text-[var(--text-muted)]">(Optional)</span>
      )}
    </label>
  );
}

function SectionTitle({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[11px] font-semibold text-[var(--brand)]">
        {number}
      </span>
      <div>
        <h2 className="text-[16px] font-medium text-[var(--text-primary)] leading-tight">
          {title}
        </h2>
      </div>
    </div>
  );
}

function PreviewMessage({
  templateType,
  campaignTitle,
  headerType,
  headerFile,
  body,
  footer,
  buttons,
  carouselCards,
  limitedOffer,
}: {
  templateType: TemplateType;
  campaignTitle: string;
  headerType: HeaderType;
  headerFile: File | null;
  body: string;
  footer: string;
  buttons: ButtonType[];
  carouselCards: CarouselCard[];
  limitedOffer: LimitedOfferData;
}) {
  const buttonLabels = buttons
    .map((id) => buttonOptions.find((option) => option.id === id)?.label)
    .filter((label): label is string => Boolean(label));
  const limitedButtonLabels = [
    limitedOffer.copyButtonText || "Copy offer code",
    limitedOffer.visitButtonText || "Visit shop",
  ];
  const headerPreview = templateType === "limited" || headerType === "text"
    ? campaignTitle
    : headerFile?.name ?? `${headerType === "doc" ? "Document" : headerType[0]?.toUpperCase() + headerType.slice(1)} header`;

  return (
    <div data-testid="template-phone-preview" className="mx-auto w-full max-w-[240px] overflow-hidden rounded-[24px] border-[7px] border-[#1f2933] bg-[#dce5df] shadow-[0_18px_36px_rgba(31,42,55,.16)]">
      <div className="flex h-8 items-center justify-between bg-[#1f2933] px-4 text-[9px] text-white">
        <span>9:41</span>
        <span className="flex items-center gap-1.5"><span>▮▮▮</span><span>▰</span><span>100%</span></span>
      </div>
      <div className="flex h-12 items-center gap-2 bg-[#075e54] px-3 text-white">
        <ArrowLeft size={15} />
        <div className="flex size-7 items-center justify-center rounded-full bg-white/20"><MessageCircle size={15} /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium">Your business</div>
          <div className="text-[9px] text-white/70">online</div>
        </div>
        <span className="text-[14px]">⋮</span>
      </div>
      <div
        data-testid="template-live-preview"
        className="min-h-[365px] bg-[#e8eee9] px-3 py-4"
        style={{
          backgroundImage:
            "radial-gradient(#cbd9d0 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      >
        <div className="mx-auto mb-3 w-fit rounded-md bg-[#d5e8d8] px-2 py-1 text-[9px] text-[#45644e] shadow-sm">
          Today
        </div>
        {templateType === "carousel" ? (
          <div data-testid="template-preview-carousel" className="mr-auto max-w-[92%] space-y-2">
            {carouselCards.map((card, index) => (
              <div key={card.id} className="overflow-hidden rounded-lg bg-white text-[10px] text-[#27332e] shadow-[0_1px_2px_rgba(0,0,0,.12)]">
                <div className="flex h-16 items-center justify-center bg-[#dbe6df] text-[9px] text-[#617269]">{card.mediaFile?.name ?? `${card.mediaType === "image" ? "Image" : "Video"} ${index + 1}`}</div>
                <div className="px-2.5 py-2">{card.content || "Card content will appear here."}</div>
                <div className="border-t border-[#e5e9e6] px-2.5 py-1.5 text-center font-medium text-[#147f78]">{card.buttonText || (card.buttonType === "website" ? "Visit Website" : "Quick reply")}</div>
              </div>
            ))}
          </div>
        ) : (
          <div data-testid="template-preview-message" className="mr-auto max-w-[92%] rounded-lg rounded-tl-none bg-white px-3 py-2.5 text-[11px] leading-[1.45] text-[#27332e] shadow-[0_1px_2px_rgba(0,0,0,.12)]">
            {((templateType === "standard" && headerType !== "none") || (templateType === "limited" && campaignTitle)) && <div className="mb-1 rounded bg-[#eef4f0] px-2 py-1 text-[9px] font-medium text-[#597067]">{headerPreview}</div>}
            {templateType === "limited" && limitedOffer.offerText && <div className="mb-1 font-semibold text-[#ad7412]">{limitedOffer.offerText}</div>}
            <div className={cn(!body && "text-[#8b9790]")}>{body || "Your template message will appear here."}</div>
            {templateType === "limited" && limitedOffer.expiry && <div className="mt-2 text-[9px] text-[#84918a]">Expires {limitedOffer.expiry.replace("T", " ")}</div>}
            {footer && templateType === "standard" && <div className="mt-2 text-[9px] text-[#84918a]">{footer}</div>}
            <div className="mt-1 text-right text-[8px] text-[#84918a]">9:41 AM</div>
          </div>
        )}
        {(templateType === "standard" ? buttonLabels : templateType === "limited" ? limitedButtonLabels : []).length > 0 && (
          <div className="mr-auto mt-1 max-w-[92%] overflow-hidden rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,.12)]">
            {(templateType === "standard" ? buttonLabels : limitedButtonLabels).map((label) => (
              <div key={label} className="border-t border-[#e5e9e6] px-3 py-2 text-center text-[10px] font-medium text-[#147f78] first:border-t-0">
                {label}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex h-9 items-center gap-2 bg-[#f0f3f1] px-3 text-[#87938c]"><span className="text-[14px]">＋</span><div className="h-5 flex-1 rounded-full bg-white" /><span className="text-[12px]">●</span></div>
    </div>
  );
}

type CarouselMediaType = "image" | "video";
type CarouselButtonType = "website" | "quick-reply";
type CarouselCard = {
  id: number;
  mediaType: CarouselMediaType;
  mediaFile: File | null;
  content: string;
  buttonType: CarouselButtonType;
  buttonText: string;
  destination: string;
};
type LimitedOfferData = {
  offerText: string;
  expiry: string;
  couponCode: string;
  copyButtonText: string;
  visitButtonText: string;
  destination: string;
};

const defaultCarouselCard = (): CarouselCard => ({ id: 1, mediaType: "image", mediaFile: null, content: "", buttonType: "website", buttonText: "", destination: "" });

function CarouselEditor({
  cards,
  setCards,
}: {
  cards: CarouselCard[];
  setCards: React.Dispatch<React.SetStateAction<CarouselCard[]>>;
}) {
  const updateCard = (id: number, changes: Partial<CarouselCard>) => {
    setCards((current) =>
      current.map((card) => (card.id === id ? { ...card, ...changes } : card)),
    );
  };

  const changeButtonType = (buttonType: CarouselButtonType) => {
    setCards((current) => current.map((card) => ({ ...card, buttonType })));
  };

  const showSampleCards = () => {
    setCards([
      { id: 1, mediaType: "image", mediaFile: null, content: "Explore our latest collection", buttonType: "website", buttonText: "Shop now", destination: "https://example.com" },
      { id: 2, mediaType: "image", mediaFile: null, content: "Limited-time offers inside", buttonType: "website", buttonText: "View offer", destination: "https://example.com" },
    ]);
  };

  return (
    <div data-testid="carousel-editor" className="mt-5 rounded-md border border-[var(--accent-purple)]/20 bg-[var(--accent-purple-soft)]/25 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h3 className="text-[14px] font-medium">Carousel cards</h3><span className="rounded-full bg-[var(--accent-purple-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-purple)]">{cards.length}/5</span></div>
          <div className="mt-1 max-w-[560px] text-[12px] leading-5 text-[var(--text-secondary)]">Display your products - create a carousel of images &amp; buttons for up to 5 cards.</div>
        </div>
        <button type="button" onClick={showSampleCards} className="text-[11px] font-medium text-[var(--brand)] hover:underline">Show sample carousel cards</button>
      </div>

      <div className="mt-4 space-y-4">
        {cards.map((card, index) => (
          <article key={card.id} className="rounded-md border border-[var(--border)] bg-white p-4 shadow-[0_2px_8px_rgba(30,40,55,.035)]">
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border-soft)] pb-3"><div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[11px] font-semibold text-[var(--brand)]">{index + 1}</span><h4 className="text-[13px] font-medium">Edit card content</h4></div>{cards.length > 1 && <button type="button" aria-label={`Remove card ${index + 1}`} onClick={() => setCards((current) => current.filter((item) => item.id !== card.id))} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--danger)]">Remove</button>}</div>
            <div>
              <div className="mb-1.5 text-[13px] font-medium">Media</div>
              <div className="mb-2 text-[12px] text-[var(--text-secondary)]">Upload either an image or video</div>
              <div className="flex flex-wrap gap-2">
                {(["image", "video"] as CarouselMediaType[]).map((mediaType) => <button key={mediaType} type="button" role="radio" aria-checked={card.mediaType === mediaType} onClick={() => updateCard(card.id, { mediaType, mediaFile: null })} className={cn("rounded-md border px-3 py-1.5 text-[11px] capitalize", card.mediaType === mediaType ? "border-[var(--accent-blue)] bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]" : "border-[var(--border)] text-[var(--text-secondary)]")}>{mediaType}</button>)}
                <label htmlFor={`carousel-media-${card.id}`} className="flex cursor-pointer items-center gap-1.5 rounded-md bg-[var(--accent-blue)] px-3 py-1.5 text-[11px] font-medium text-white hover:brightness-95"><Upload size={13} /> Upload media<input id={`carousel-media-${card.id}`} aria-label={`Upload ${card.mediaType} for card ${index + 1}`} type="file" accept={card.mediaType === "image" ? "image/*" : "video/*"} onChange={(event) => updateCard(card.id, { mediaFile: event.target.files?.[0] ?? null })} className="sr-only" /></label>
              </div>
              <div className="mt-2 text-[11px] text-[var(--text-muted)]">Uploaded from PC: <span className="font-medium text-[var(--text-secondary)]">{card.mediaFile?.name ?? "No file selected"}</span></div>
            </div>
            <div className="mt-4"><FieldLabel htmlFor={`carousel-content-${card.id}`}>Card content</FieldLabel><div className="mb-2 text-[12px] text-[var(--text-secondary)]">Input a minimum of 1 card content and button</div><textarea id={`carousel-content-${card.id}`} value={card.content} onChange={(event) => updateCard(card.id, { content: event.target.value })} maxLength={160} rows={3} placeholder="Template Message..." className="w-full resize-none rounded-md border border-[var(--border)] bg-white px-3 py-2.5 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10" /><div className="mt-1 text-right text-[12px] text-[var(--text-muted)]">{card.content.length}/160</div></div>
            <div className="mt-4 border-t border-[var(--border-soft)] pt-4"><div className="text-[13px] font-medium">Buttons</div><div className="mt-1 text-[12px] text-[var(--text-secondary)]">Button type must be the same across all carousel cards.</div><div className="mt-3 flex flex-wrap gap-2">{(["website", "quick-reply"] as CarouselButtonType[]).map((buttonType) => <button key={buttonType} type="button" role="radio" aria-checked={card.buttonType === buttonType} onClick={() => changeButtonType(buttonType)} className={cn("rounded-md border px-3 py-1.5 text-[12px]", card.buttonType === buttonType ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--border)] text-[var(--text-secondary)]")}>{buttonType === "website" ? "Visit Website" : "Quick replies"}</button>)}</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><FieldLabel htmlFor={`carousel-button-text-${card.id}`}>Button Text</FieldLabel><Input id={`carousel-button-text-${card.id}`} value={card.buttonText} onChange={(event) => updateCard(card.id, { buttonText: event.target.value })} maxLength={25} placeholder="Button Text" /><div className="mt-1 text-right text-[12px] text-[var(--text-muted)]">{card.buttonText.length}/25</div></div>{card.buttonType === "website" && <div><FieldLabel htmlFor={`carousel-destination-${card.id}`}>Static</FieldLabel><Input id={`carousel-destination-${card.id}`} value={card.destination} onChange={(event) => updateCard(card.id, { destination: event.target.value })} maxLength={2000} placeholder="https://www.wati.io" /><div className="mt-1 text-right text-[12px] text-[var(--text-muted)]">{card.destination.length}/2000</div></div>}</div></div>
          </article>
        ))}
      </div>
      <button type="button" disabled={cards.length >= 5} onClick={() => setCards((current) => [...current, { id: Math.max(...current.map((card) => card.id), 0) + 1, mediaType: "image", mediaFile: null, content: "", buttonType: current[0]?.buttonType ?? "website", buttonText: "", destination: "" }])} className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-[var(--brand)] disabled:text-[var(--text-muted)]"><Plus size={14} /> Add another card</button>
    </div>
  );
}

function LimitedOfferEditor({
  data,
  onChange,
}: {
  data: LimitedOfferData;
  onChange: (changes: Partial<LimitedOfferData>) => void;
}) {

  return (
    <div className="mt-5 space-y-5">
      <section className="rounded-md border border-[var(--accent-amber)]/20 bg-[var(--accent-amber-soft)]/25 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3"><h3 className="text-[14px] font-medium">Promotional time frame</h3><span className="rounded-full bg-[var(--accent-amber-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent-amber)]">Offer</span></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><FieldLabel htmlFor="offer-text">Offer text</FieldLabel><Input id="offer-text" value={data.offerText} onChange={(event) => onChange({ offerText: event.target.value })} maxLength={16} placeholder="Buy 3 get 1" /><div className="mt-1 text-right text-[12px] text-[var(--text-muted)]">{data.offerText.length}/16</div></div>
          <div><FieldLabel htmlFor="offer-expiry" optional>Offer expiry</FieldLabel><input id="offer-expiry" type="datetime-local" value={data.expiry} onChange={(event) => onChange({ expiry: event.target.value })} className="flex h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10" /><div className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">Timezone will update dynamically for your users - currently set against your timezone (GMT+05:30)</div></div>
        </div>
      </section>

      <section className="rounded-md border border-[var(--border)] bg-white p-4 shadow-[0_2px_8px_rgba(30,40,55,.035)] sm:p-5">
        <div className="mb-4"><h3 className="text-[14px] font-medium">Buttons</h3><div className="mt-1 text-[12px] text-[var(--text-secondary)]">Add custom actions that your users can easily take</div></div>
        <div className="space-y-4">
          <div className="rounded-md border border-[var(--border-soft)] bg-[#fbfcfc] p-3.5"><div className="mb-3 flex items-center gap-2 text-[13px] font-medium"><span className="flex size-7 items-center justify-center rounded-md bg-[var(--accent-amber-soft)] text-[var(--accent-amber)]"><CopyIcon size={14} /></span>Copy offer code</div><div className="grid gap-3 sm:grid-cols-2"><div><FieldLabel htmlFor="copy-offer-button-text">Button Text</FieldLabel><Input id="copy-offer-button-text" value={data.copyButtonText} onChange={(event) => onChange({ copyButtonText: event.target.value })} maxLength={25} /><div className="mt-1 text-right text-[12px] text-[var(--text-muted)]">{data.copyButtonText.length}/25</div></div><div><FieldLabel htmlFor="coupon-code">Enter coupon code to copy</FieldLabel><Input id="coupon-code" value={data.couponCode} onChange={(event) => onChange({ couponCode: event.target.value })} maxLength={15} placeholder="Enter coupon code to copy" /><div className="mt-1 text-right text-[12px] text-[var(--text-muted)]">{data.couponCode.length}/15</div></div></div></div>
          <div className="rounded-md border border-[var(--border-soft)] bg-[#fbfcfc] p-3.5"><div className="mb-3 flex items-center gap-2 text-[13px] font-medium"><span className="flex size-7 items-center justify-center rounded-md bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]"><ExternalLink size={14} /></span>Visit Website</div><div className="grid gap-3 sm:grid-cols-2"><div><FieldLabel htmlFor="visit-offer-button-text">Button Text</FieldLabel><Input id="visit-offer-button-text" value={data.visitButtonText} onChange={(event) => onChange({ visitButtonText: event.target.value })} maxLength={25} /><div className="mt-1 text-right text-[12px] text-[var(--text-muted)]">{data.visitButtonText.length}/25</div></div><div><FieldLabel htmlFor="visit-offer-destination">Static</FieldLabel><Input id="visit-offer-destination" value={data.destination} onChange={(event) => onChange({ destination: event.target.value })} maxLength={2000} /><div className="mt-1 text-right text-[12px] text-[var(--text-muted)]">{data.destination.length}/2000</div></div></div></div>
        </div>
      </section>
    </div>
  );
}

export function TemplateBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { accessToken, user } = useAuth();
  const workspaceId = getActiveMembership(user)?.workspace.id;
  const editTemplateId = searchParams.get("templateId");
  const [loadingTemplate, setLoadingTemplate] = useState(Boolean(editTemplateId));
  const [templateName, setTemplateName] = useState("");
  const [category, setCategory] = useState("Marketing");
  const [language, setLanguage] = useState("");
  const [templateType, setTemplateType] = useState<TemplateType>("standard");
  const [headerType, setHeaderType] = useState<HeaderType>("text");
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [headerHandle, setHeaderHandle] = useState("");
  const [headerHandleType, setHeaderHandleType] = useState<HeaderType>("none");
  const [catalogReady, setCatalogReady] = useState(false);
  const [carouselCards, setCarouselCards] = useState<CarouselCard[]>([defaultCarouselCard()]);
  const [limitedOffer, setLimitedOffer] = useState<LimitedOfferData>({
    offerText: "",
    expiry: "",
    couponCode: "",
    copyButtonText: "Copy offer code",
    visitButtonText: "Visit shop",
    destination: "",
  });
  const [campaignTitle, setCampaignTitle] = useState("");
  const [body, setBody] = useState("");
  const [bodyExamples, setBodyExamples] = useState<string[]>([]);
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<ButtonType[]>([]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [flowId, setFlowId] = useState("");
  const [flowNavigateScreen, setFlowNavigateScreen] = useState("");
  const [offerCodeExample, setOfferCodeExample] = useState("");
  const [buttonTexts, setButtonTexts] = useState<Record<ButtonType, string>>(defaultButtonTexts);
  const [headerExamples, setHeaderExamples] = useState<string[]>([]);
  const [otpType, setOtpType] = useState<OtpType>("COPY_CODE");
  const [oneTapPackageName, setOneTapPackageName] = useState("");
  const [oneTapSignatureHash, setOneTapSignatureHash] = useState("");
  const [addSecurityRecommendation, setAddSecurityRecommendation] = useState(true);
  const [codeExpirationMinutes, setCodeExpirationMinutes] = useState("10");
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState<Partial<Record<ValidationField, string>>>({});
  const [savingAction, setSavingAction] = useState<SaveAction | null>(null);
  const [savedAction, setSavedAction] = useState<SaveAction | null>(null);
  const templateNameRef = useRef<HTMLInputElement>(null);
  const languageRef = useRef<HTMLSelectElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!workspaceId || !accessToken) return;
    void apiRequest<{ catalogReady?: boolean }>(`/workspaces/${workspaceId}/templates/capabilities`, { headers: { authorization: `Bearer ${accessToken}` } })
      .then((result) => setCatalogReady(result.catalogReady === true))
      .catch(() => setCatalogReady(false));
  }, [accessToken, workspaceId]);

  useEffect(() => {
    if (!editTemplateId || !workspaceId || !accessToken) { setLoadingTemplate(false); return; }
    void (async () => {
      try {
        const template = await apiRequest<{
          name: string; category: string; language: string; templateType: TemplateType; headerType: HeaderType;
          headerText: string | null; body: string; footer: string | null; metaTemplateId?: string | null; metaTemplateName?: string | null; content: {
            websiteUrl?: string;
            phoneNumber?: string; flowId?: string; flowNavigateScreen?: string; offerCodeExample?: string;
            headerHandle?: string; bodyExamples?: string[]; headerExamples?: string[]; websiteUrlExamples?: string[];
            buttonTexts?: Partial<Record<ButtonType, string>>;
            buttons?: ButtonType[]; carouselCards?: Array<Omit<CarouselCard, "id" | "mediaFile"> & { mediaFileName?: string | null }>;
            limitedOffer?: LimitedOfferData;
            otpType?: OtpType; addSecurityRecommendation?: boolean; codeExpirationMinutes?: number; packageName?: string; signatureHash?: string;
          };
          }>(`/workspaces/${workspaceId}/templates/${editTemplateId}`, { headers: { authorization: `Bearer ${accessToken}` } });
        setTemplateName(template.name); setCategory(template.category); setLanguage(template.language); setTemplateType(template.templateType); setHeaderType(template.headerType); setHeaderHandle(template.content.headerHandle ?? ""); setHeaderHandleType(template.content.headerHandle ? template.headerType : "none"); setCampaignTitle(template.headerText ?? ""); const loadedBody = template.body || (template.category === "Authentication" ? "Your verification code is {{1}}." : ""); setBody(loadedBody); setBodyExamples(template.content.bodyExamples ?? []); setHeaderExamples(template.content.headerExamples ?? []); setFooter(template.footer ?? ""); setButtons(template.content.buttons ?? []); setWebsiteUrl(typeof template.content.websiteUrl === "string" ? template.content.websiteUrl : ""); setPhoneNumber(typeof template.content.phoneNumber === "string" ? template.content.phoneNumber : ""); setFlowId(typeof template.content.flowId === "string" ? template.content.flowId : ""); setFlowNavigateScreen(typeof template.content.flowNavigateScreen === "string" ? template.content.flowNavigateScreen : ""); setOfferCodeExample(typeof template.content.offerCodeExample === "string" ? template.content.offerCodeExample : ""); setButtonTexts({ ...defaultButtonTexts, ...(template.content.buttonTexts ?? {}) }); setOtpType(template.content.otpType ?? "COPY_CODE"); setOneTapPackageName(template.content.packageName ?? ""); setOneTapSignatureHash(template.content.signatureHash ?? ""); setAddSecurityRecommendation(template.content.addSecurityRecommendation !== false); setCodeExpirationMinutes(String(template.content.codeExpirationMinutes ?? 10));
        setCarouselCards(template.content.carouselCards?.map((card, index) => ({ ...card, id: index + 1, mediaFile: null })) ?? [defaultCarouselCard()]);
        setLimitedOffer(template.content.limitedOffer ?? { offerText: "", expiry: "", couponCode: "", copyButtonText: "Copy offer code", visitButtonText: "Visit shop", destination: "" });
      } catch (caughtError) { setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load the template."); }
      finally { setLoadingTemplate(false); }
    })();
  }, [accessToken, editTemplateId, workspaceId]);

  const bodyCount = body.length;
  const footerCount = footer.length;
  const bodyVariableNumbers = useMemo(() => [...new Set([...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1])))].sort((a, b) => a - b), [body]);
  const headerVariableNumbers = useMemo(() => [...new Set([...campaignTitle.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1])))].sort((a, b) => a - b), [campaignTitle]);
  const nextVariable = useMemo(() => {
    const values = [...body.matchAll(/{{\s*(\d+)\s*}}/g)].map((match) => Number(match[1]));
    return Math.max(0, ...values) + 1;
  }, [body]);

  const addVariable = () => {
    setBody((current) => `${current}${current && !/\s$/.test(current) ? " " : ""}{{${nextVariable}}}`);
  };

  const addButton = (id: ButtonType) => {
    if (buttons.length >= 7 || buttons.includes(id)) return;
    setButtons((current) => [...current, id]);
  };

  const validateRequiredFields = (action: SaveAction) => {
    const nextErrors: Partial<Record<ValidationField, string>> = {};
    if (!templateName.trim()) nextErrors.name = "Template name is required.";
    else if (!templateName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")) nextErrors.name = "Enter a template name containing letters or numbers.";
    if (!language) nextErrors.language = "Select a template language.";
    if (category !== "Authentication" && !body.trim()) nextErrors.body = "Template message is required.";
    const bodyNumbers = category === "Authentication" ? [] : [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1]));
    const bodyExpected = Array.from({ length: Math.max(0, ...bodyNumbers) }, (_, index) => index + 1);
    if (bodyNumbers.length && ([...new Set(bodyNumbers)].sort((a, b) => a - b).some((value, index) => value !== bodyExpected[index]) || bodyExamples.slice(0, Math.max(...bodyNumbers)).some((value) => !value.trim()) || bodyExamples.length < Math.max(...bodyNumbers))) {
      nextErrors.body = "Add one non-empty sample value for every numbered body variable, in order.";
    }
    if (headerType === "text" && campaignTitle.trim()) {
      const headerNumbers = [...campaignTitle.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1]));
      const headerExpected = Array.from({ length: Math.max(0, ...headerNumbers) }, (_, index) => index + 1);
      if (headerNumbers.length && ([...new Set(headerNumbers)].sort((a, b) => a - b).some((value, index) => value !== headerExpected[index]) || headerExamples.slice(0, Math.max(...headerNumbers)).some((value) => !value.trim()) || headerExamples.length < Math.max(...headerNumbers))) nextErrors.body = "Add a sample value for every text-header variable.";
    }
    if (action === "template") {
      if (templateType === "standard" && ["image", "video", "doc"].includes(headerType) && !headerHandle && !headerFile) nextErrors.body = "Upload the selected media header before submitting this template.";
      if (templateType === "multi-product" && category !== "Marketing") nextErrors.body = "Multi-product templates must use the Marketing category.";
      if (templateType === "carousel") nextErrors.body = "Carousel template submission is not available until Meta's current schema is configured.";
      if (templateType === "limited") nextErrors.body = "Limited Time Offer template submission is not available for the configured Meta API version.";
      if (category === "Authentication" && otpType === "ONE_TAP" && (!oneTapPackageName.trim() || !oneTapSignatureHash.trim())) nextErrors.body = "ONE_TAP authentication requires package name and signature hash.";
      if (category === "Authentication" && (!Number.isInteger(Number(codeExpirationMinutes)) || Number(codeExpirationMinutes) < 1 || Number(codeExpirationMinutes) > 90)) nextErrors.body = "Code expiration must be a whole number from 1 to 90 minutes.";
    }
    setValidationErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const firstInvalid = (Object.keys(nextErrors) as ValidationField[])[0];
      const fieldRefs = { name: templateNameRef, language: languageRef, body: bodyRef };
      const element = fieldRefs[firstInvalid]?.current;
      window.requestAnimationFrame(() => {
        element?.scrollIntoView?.({ behavior: "smooth", block: "center" });
        element?.focus?.();
      });
      return false;
    }
    return true;
  };

  const clearValidationError = (field: ValidationField) => {
    setValidationErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleCategoryChange = (nextCategory: string) => {
    setCategory(nextCategory);
    if (nextCategory === "Authentication") {
      setTemplateType("standard");
      setHeaderType("none");
      setHeaderFile(null);
      setHeaderHandle("");
      setHeaderHandleType("none");
      setCampaignTitle("");
      setButtons([]);
      setWebsiteUrl("");
      if (!body.trim()) setBody("Your verification code is {{1}}.");
    }
  };

  const metaSubmitIssue = templateType === "carousel"
    ? "Carousel template submission is disabled until Meta's current official schema is configured. Save this design as a draft."
    : templateType === "limited"
      ? "Limited Time Offer template submission is disabled until Meta's current official schema is configured. Save this design as a draft."
    : headerType !== "none" && headerType !== "text"
        ? !headerHandle && !headerFile ? "Upload the selected media header before submitting this template." : null
        : buttons.includes("website") && !/^https?:\/\/[^\s]+$/i.test(websiteUrl.trim())
          ? "Enter a valid http(s) website URL before submitting this template."
          : buttons.includes("call") && !/^\+?[1-9][\d\s().-]{6,18}$/.test(phoneNumber.trim())
            ? "Enter a valid phone number with country code before submitting this template."
            : buttons.includes("flow") && !flowId.trim()
              ? "Enter a Meta WhatsApp Flow ID before submitting this template."
              : buttons.includes("flow") && !flowNavigateScreen.trim()
                ? "Enter a Flow navigation screen ID before submitting this template."
                : buttons.includes("offer") && !offerCodeExample.trim()
                  ? "Enter an example offer code before submitting this template."
                  : buttons.some((button) => ["flow", "catalog", "offer"].includes(button)) && buttons.length > 1
                    ? "Flow, catalog, and offer-code buttons must be submitted by themselves."
                    : buttons.includes("quick-reply") && buttons.some((button) => ["website", "call"].includes(button))
                      ? "Choose quick replies or call-to-action buttons, not both."
                    : null;

  const saveTemplate = async (action: SaveAction) => {
    setError("");
    setSavedAction(null);
    if (!validateRequiredFields(action)) return;
    if (!workspaceId || !accessToken) {
      setError("Select an active workspace before saving the template.");
      return;
    }
    if (action === "template" && metaSubmitIssue) {
      setError(metaSubmitIssue);
      return;
    }
    setSavingAction(action);
    try {
      let uploadedHeaderHandle = headerHandleType === headerType ? headerHandle : "";
      if (action === "template" && headerFile && ["image", "video", "doc"].includes(headerType)) {
        const uploaded = await apiRequest<{ handle?: string }>(`/workspaces/${workspaceId}/templates/media`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/octet-stream",
            "x-file-type": headerFile.type,
            "x-file-name": headerFile.name,
          },
          body: await headerFile.arrayBuffer(),
        });
        if (!uploaded?.handle) throw new Error("Meta did not return a media handle for the selected header.");
        uploadedHeaderHandle = uploaded.handle;
        setHeaderHandle(uploadedHeaderHandle);
        setHeaderHandleType(headerType);
      }
      const submittedHeaderType = (templateType === "standard" || templateType === "multi-product") && headerType === "text" && !campaignTitle.trim()
        ? "none"
        : headerType;
      const savedTemplate = await apiRequest<{ status?: string }>(editTemplateId ? `/workspaces/${workspaceId}/templates/${editTemplateId}` : `/workspaces/${workspaceId}/templates`, {
        method: editTemplateId ? "PATCH" : "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          saveAs: action === "draft" ? "draft" : "submit",
          name: templateName,
          category,
          language,
          templateType,
          headerType: templateType === "standard" || templateType === "multi-product" ? submittedHeaderType : "none",
          headerText: (templateType === "standard" || templateType === "multi-product") && submittedHeaderType === "text" ? campaignTitle : templateType === "limited" ? campaignTitle : null,
          headerFileName: headerFile?.name ?? null,
          body,
          footer: templateType === "standard" ? footer : null,
          content: {
            buttons,
            bodyExamples: bodyExamples.slice(0, Math.max(0, ...bodyVariableNumbers)),
            headerExamples: headerExamples.slice(0, Math.max(0, ...headerVariableNumbers)),
            headerHandle: uploadedHeaderHandle || undefined,
            websiteUrl,
            phoneNumber,
            flowId,
            flowNavigateScreen,
            offerCodeExample,
            buttonTexts,
            carouselCards: carouselCards.map(({ mediaFile, ...card }) => ({ ...card, mediaFileName: mediaFile?.name ?? null })),
            limitedOffer,
            otpType,
            packageName: oneTapPackageName,
            signatureHash: oneTapSignatureHash,
            addSecurityRecommendation,
            codeExpirationMinutes: Number(codeExpirationMinutes) || 10,
          },
        }),
      });
      setError("");
      setSavedAction(action);
      toast.success(savedTemplate?.status === "REJECTED" ? "Template saved and marked Rejected in the library." : action === "draft" ? "Template saved as draft." : "Template submitted for review.");
      window.setTimeout(() => navigate("/templates"), 800);
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.code === "TEMPLATE_AI_VALIDATION_FAILED" && caughtError.details && typeof caughtError.details === "object" && "issues" in caughtError.details && Array.isArray(caughtError.details.issues)) {
        const issueText = caughtError.details.issues.map((issue) => {
          if (!issue || typeof issue !== "object") return "";
          const item = issue as { field?: unknown; message?: unknown; suggestion?: unknown };
          return `${typeof item.field === "string" ? `${item.field}: ` : ""}${typeof item.message === "string" ? item.message : ""}${typeof item.suggestion === "string" && item.suggestion ? ` ${item.suggestion}` : ""}`.trim();
        }).filter(Boolean).join(" ");
        setError(`${caughtError.message}${issueText ? ` ${issueText}` : ""}`);
      } else {
        setError(caughtError instanceof ApiError ? caughtError.message : "Unable to save the template.");
      }
    } finally {
      setSavingAction(null);
    }
  };

  if (loadingTemplate) return <div data-testid="template-page" className="flex h-full min-h-0 items-center justify-center overflow-hidden bg-[var(--page-background)] text-sm text-[var(--text-secondary)]">Loading template...</div>;

  return (
    <div data-testid="template-page" className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex-none border-b border-[var(--border-soft)] bg-white shadow-[0_2px_6px_rgba(30,40,55,.035)]">
        <div className="mx-auto flex min-h-[74px] max-w-[1400px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Back to templates" onClick={() => navigate("/templates")} className="flex size-8 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]">
              <ArrowLeft size={17} />
            </button>
            <div>
              <h1 className="text-[19px] font-medium leading-tight text-[var(--text-primary)]">Create template</h1>
              <div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">Create a WhatsApp template and preview it before submitting.</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={Boolean(savingAction)} onClick={() => void saveTemplate("draft")}>
              {savingAction === "draft" ? <LoaderCircle className="animate-spin" size={14} /> : savedAction === "draft" ? <Check size={14} /> : <FileText size={14} />}
              {savingAction === "draft" ? "Saving..." : savedAction === "draft" ? "Saved" : "Save to draft"}
            </Button>
            <Button disabled={Boolean(savingAction)} onClick={() => void saveTemplate("template")}>
              {savingAction === "template" ? <LoaderCircle className="animate-spin" size={14} /> : savedAction === "template" ? <Check size={14} /> : <Save size={14} />}
              {savingAction === "template" ? "Saving..." : savedAction === "template" ? "Saved" : "Save template"}
            </Button>
          </div>
          {metaSubmitIssue && <div className="basis-full text-right text-[11px] text-[var(--text-secondary)]">{metaSubmitIssue}</div>}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden bg-[var(--page-background)]">
        <div className="mx-auto flex h-full min-h-0 max-w-[1400px] flex-col gap-5 overflow-y-auto px-5 py-5 sm:px-8 lg:flex-row lg:overflow-hidden">
          <section data-testid="template-editor-scroll-region" className="min-h-0 flex-1 space-y-4 overflow-visible lg:overflow-y-auto lg:pr-1">
            {error && <div role="alert" className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-[12px] text-[var(--danger)]">{error}</div>}

            <section className="rounded-md border border-[var(--border)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-6">
              <SectionTitle number="1" title="Template details" />
              <div className="grid gap-4 sm:grid-cols-2">
                <div><FieldLabel htmlFor="template-name">Template Name</FieldLabel><Input ref={templateNameRef} id="template-name" value={templateName} aria-invalid={Boolean(validationErrors.name)} aria-describedby={validationErrors.name ? "template-name-error" : undefined} onChange={(event) => { setTemplateName(event.target.value); setSavedAction(null); clearValidationError("name"); }} placeholder="Template Name" className={cn(validationErrors.name && "border-[var(--danger)] focus:border-[var(--danger)] focus-visible:ring-red-100")} />{validationErrors.name && <div id="template-name-error" role="alert" className="mt-1.5 text-[12px] text-[var(--danger)]">{validationErrors.name}</div>}</div>
                <div><FieldLabel htmlFor="template-category">Category</FieldLabel><div className="relative"><select id="template-category" value={category} onChange={(event) => handleCategoryChange(event.target.value)} className="h-10 w-full appearance-none rounded-md border border-[var(--border)] bg-white px-3 pr-9 text-sm outline-none focus:border-[var(--brand)]"><option>Marketing</option><option>Utility</option><option>Authentication</option></select><ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-[var(--text-muted)]" /></div></div>
                <div><FieldLabel htmlFor="template-language">Language</FieldLabel><div className="relative"><select ref={languageRef} id="template-language" value={language} aria-invalid={Boolean(validationErrors.language)} aria-describedby={validationErrors.language ? "template-language-error" : undefined} onChange={(event) => { setLanguage(event.target.value); setSavedAction(null); clearValidationError("language"); }} className={cn("h-10 w-full appearance-none rounded-md border border-[var(--border)] bg-white px-3 pr-9 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand)]", validationErrors.language && "border-[var(--danger)] focus:border-[var(--brand)] focus-visible:ring-red-100")}><option value="">Language...</option><option value="en_US">English (US)</option><option value="en_GB">English (UK)</option><option value="hi">Hindi</option><option value="English">English (legacy)</option></select><ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-[var(--text-muted)]" /></div>{validationErrors.language && <div id="template-language-error" role="alert" className="mt-1.5 text-[12px] text-[var(--danger)]">{validationErrors.language}</div>}</div>
              </div>
            </section>

            <section className="rounded-md border border-[var(--border)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-6">
              <SectionTitle number="2" title="Select Marketing template" />
              <div data-testid="template-type-grid" className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                {templateTypes.filter((item) => item.id !== "multi-product" || catalogReady).map((item) => {
                  const Icon = item.icon;
                  const selected = templateType === item.id;
                  return (
                  <button key={item.id} type="button" aria-pressed={selected} onClick={() => { setTemplateType(item.id); setHeaderFile(null); if (item.id === "standard") setHeaderType("text"); }} className={cn("group relative flex min-h-[84px] items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-all", selected ? "border-[var(--brand)] bg-[var(--brand-soft)]/75 shadow-[0_0_0_1px_var(--brand)]" : "border-[var(--border)] bg-white text-[var(--text-secondary)] hover:-translate-y-px hover:border-[var(--brand)]/50 hover:bg-[var(--brand-soft)]/35 hover:shadow-[0_4px_12px_rgba(17,107,111,.08)]")}>
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border bg-white transition-colors", selected ? "border-transparent text-[var(--brand)] shadow-sm" : "border-[var(--border-soft)] text-[var(--text-muted)] group-hover:text-[var(--brand)]")}><Icon size={17} /></span>
                    <span className="min-w-0 pr-4"><span className={cn("block truncate text-[12px] font-medium", selected ? "text-[var(--brand)]" : "text-[var(--text-primary)]")}>{item.label}</span><span className="mt-0.5 block truncate text-[10px] text-[var(--text-muted)]">{item.description}</span></span>
                    {selected && <span className="absolute right-2.5 top-2.5 flex size-4 items-center justify-center rounded-full bg-[var(--brand)] text-white"><Check size={10} strokeWidth={3} /></span>}
                  </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-md border border-[var(--border)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-6">
              <SectionTitle number="3" title="Message content" />
              {templateType === "standard" && headerVariableNumbers.length > 0 && <div className="mb-5 rounded-md border border-[var(--border-soft)] bg-[#fbfcfc] p-3.5"><div className="text-[12px] font-medium text-[var(--text-primary)]">Header variable samples</div>{headerVariableNumbers.map((number, index) => <div key={number} className="mt-2"><FieldLabel htmlFor={`header-example-${number}`}>{`{{${number}}}`}</FieldLabel><Input id={`header-example-${number}`} value={headerExamples[index] ?? ""} onChange={(event) => setHeaderExamples((current) => { const next = [...current]; next[index] = event.target.value; return next; })} placeholder="Example value" /></div>)}</div>}
              <div className="space-y-5">
                {category === "Authentication" && <div data-testid="authentication-template-settings" className="rounded-md border border-[var(--brand)]/20 bg-[var(--brand-soft)]/45 p-4"><div className="text-[13px] font-medium text-[var(--text-primary)]">OTP authentication template</div><div className="mt-1 text-[11px] leading-5 text-[var(--text-secondary)]">Meta supplies the secure OTP format when this template is submitted.</div><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><FieldLabel htmlFor="otp-type">OTP button</FieldLabel><select id="otp-type" value={otpType} onChange={(event) => setOtpType(event.target.value as OtpType)} className="h-10 w-full rounded-md border border-[var(--border)] bg-white px-3 text-sm outline-none"><option value="COPY_CODE">Copy code</option><option value="ONE_TAP">One-tap autofill</option></select></div><div><FieldLabel htmlFor="otp-expiration">Code expiration (minutes)</FieldLabel><Input id="otp-expiration" type="number" min={1} max={90} value={codeExpirationMinutes} onChange={(event) => setCodeExpirationMinutes(event.target.value)} className="h-10 text-sm" /></div></div>{otpType === "ONE_TAP" && <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><FieldLabel htmlFor="otp-package-name">Android package name</FieldLabel><Input id="otp-package-name" value={oneTapPackageName} onChange={(event) => setOneTapPackageName(event.target.value)} placeholder="com.example.app" /></div><div><FieldLabel htmlFor="otp-signature-hash">App signature hash</FieldLabel><Input id="otp-signature-hash" value={oneTapSignatureHash} onChange={(event) => setOneTapSignatureHash(event.target.value)} placeholder="K8a%2FAINcGX7" /></div></div>}<label className="mt-4 flex items-center gap-2 text-xs text-[var(--text-primary)]"><input type="checkbox" checked={addSecurityRecommendation} onChange={(event) => setAddSecurityRecommendation(event.target.checked)} className="size-4 accent-[var(--brand)]" />Add Meta's security recommendation</label></div>}
                {templateType === "standard" && category !== "Authentication" && <div><FieldLabel htmlFor="campaign-title" optional>Campaign title</FieldLabel><div role="radiogroup" aria-label="Campaign title type" className="grid grid-cols-2 gap-2 sm:grid-cols-5">{headerOptions.map((option) => { const selectedHeader = headerType === option.id; return <button key={option.id} type="button" role="radio" aria-checked={selectedHeader} onClick={() => { setHeaderType(option.id); setHeaderFile(null); }} className={cn("flex items-center gap-2 rounded-md border px-3 py-2 text-left text-[11px] transition-colors", selectedHeader ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]" : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--brand)]/50")}><span className={cn("flex size-3.5 items-center justify-center rounded-full border", selectedHeader ? "border-[var(--brand)]" : "border-[var(--border)]")}>{selectedHeader && <span className="size-1.5 rounded-full bg-[var(--brand)]" />}</span>{option.label}</button>; })}</div>{headerType === "text" && <textarea id="campaign-title" value={campaignTitle} onChange={(event) => setCampaignTitle(event.target.value)} maxLength={60} rows={2} placeholder="Highlight your brand here, use images or videos, to stand out" className="mt-3 w-full resize-none rounded-md border border-[var(--border)] bg-white px-3 py-2.5 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10" />}{headerType !== "none" && headerType !== "text" && <div className="mt-3 flex items-center gap-3 rounded-md border border-dashed border-[var(--border)] bg-[#fbfcfc] px-3.5 py-3 text-[11px] text-[var(--text-secondary)]"><span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]"><Upload size={15} /></span><div className="min-w-0 flex-1"><div className="font-medium text-[var(--text-primary)]">{headerFile ? headerFile.name : `Upload ${headerType === "doc" ? "document" : headerType}`}</div><div className="mt-0.5">{headerFile ? "File selected" : `Add a ${headerType === "doc" ? "document" : headerType} for your campaign header.`}</div></div>{headerFile ? <button type="button" onClick={() => setHeaderFile(null)} className="shrink-0 font-medium text-[var(--danger)] hover:underline">Remove</button> : <label htmlFor="header-media-file" className="flex h-8 shrink-0 cursor-pointer items-center rounded-md bg-[var(--accent-blue)] px-3 text-[11px] font-medium text-white hover:brightness-95">Choose file<input id="header-media-file" aria-label={`Upload ${headerType === "doc" ? "document" : headerType}`} type="file" accept={headerType === "image" ? "image/*" : headerType === "video" ? "video/*" : ".pdf,.doc,.docx,application/pdf"} onChange={(event) => setHeaderFile(event.target.files?.[0] ?? null)} className="sr-only" /></label>}</div>}</div>}
                 {templateType === "limited" && <div><FieldLabel htmlFor="campaign-title" optional>Media header</FieldLabel><textarea id="campaign-title" value={campaignTitle} onChange={(event) => setCampaignTitle(event.target.value)} maxLength={60} rows={2} placeholder="Highlight your brand here, use images or videos, to stand out" className="w-full resize-none rounded-md border border-[var(--border)] bg-white px-3 py-2.5 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10" /></div>}
              <div><div className="flex items-start justify-between gap-3"><div><FieldLabel htmlFor="template-body">Body</FieldLabel><div className="-mt-1 mb-2 text-[12px] text-[var(--text-secondary)]">{templateType === "limited" ? "Let users know how and what they will be able to redeem below" : "Make your messages personal using numbered variables like {{1}} and get more replies!"}</div></div><button type="button" onClick={addVariable} className="mt-0.5 flex shrink-0 items-center gap-1 text-[12px] font-medium text-[var(--brand)] hover:underline"><Plus size={14} /> Add Variable</button></div><textarea ref={bodyRef} id="template-body" value={body} aria-invalid={Boolean(validationErrors.body)} aria-describedby={validationErrors.body ? "template-body-error" : undefined} onChange={(event) => { setBody(event.target.value); setSavedAction(null); clearValidationError("body"); }} maxLength={1024} rows={6} placeholder="Template Message..." className={cn("w-full resize-y rounded-md border border-[var(--border)] bg-white px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10", validationErrors.body && "border-[var(--danger)] focus:border-[var(--danger)] focus:ring-red-100")} />{validationErrors.body && <div id="template-body-error" role="alert" className="mt-1.5 text-[12px] text-[var(--danger)]">{validationErrors.body}</div>}<div className="mt-1 text-right text-[12px] text-[var(--text-muted)]">{bodyCount}/1024</div></div>
                 {bodyVariableNumbers.length > 0 && <div className="rounded-md border border-[var(--border-soft)] bg-[#fbfcfc] p-3.5"><div className="text-[12px] font-medium text-[var(--text-primary)]">Body variable samples</div><div className="mt-2 grid gap-2 sm:grid-cols-2">{bodyVariableNumbers.map((number, index) => <div key={number}><FieldLabel htmlFor={`body-example-${number}`}>{`{{${number}}}`}</FieldLabel><Input id={`body-example-${number}`} value={bodyExamples[index] ?? ""} onChange={(event) => setBodyExamples((current) => { const next = [...current]; next[index] = event.target.value; return next; })} placeholder="Example value" /></div>)}</div></div>}
                 {templateType === "carousel" ? <CarouselEditor cards={carouselCards} setCards={setCarouselCards} /> : templateType === "limited" ? <LimitedOfferEditor data={limitedOffer} onChange={(changes) => setLimitedOffer((current) => ({ ...current, ...changes }))} /> : category === "Authentication" ? null : <div><FieldLabel htmlFor="template-footer" optional>Footer</FieldLabel><textarea id="template-footer" value={footer} onChange={(event) => setFooter(event.target.value)} maxLength={60} rows={2} placeholder="Footers are great to add any disclaimers or to add a thoughtful PS" className="w-full resize-none rounded-md border border-[var(--border)] bg-white px-3 py-2.5 text-sm outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/10" /><div className="mt-1 text-right text-[11px] text-[var(--text-muted)]">{footerCount}/60</div></div>}
              </div>
            </section>

             {templateType === "standard" && category !== "Authentication" && <section className="rounded-md border border-[var(--border)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] sm:p-6">
              <div className="mb-1 flex items-start justify-between gap-3"><SectionTitle number="4" title="Buttons" /><span className="shrink-0 text-[12px] text-[var(--text-secondary)]">{buttons.length}/7</span></div>
              <div className="divide-y divide-[var(--border-soft)] rounded-md border border-[var(--border)]">
                {buttonOptions.map(({ id, label, icon: Icon }) => { const added = buttons.includes(id); return <div key={id} className="flex items-center gap-3 px-3.5 py-3"><div className="flex size-7 items-center justify-center rounded-md bg-[var(--brand-soft)] text-[var(--brand)]"><Icon size={14} /></div><span className="flex-1 text-[12px] text-[var(--text-primary)]">{label}</span>{added ? <button type="button" onClick={() => setButtons((current) => current.filter((item) => item !== id))} className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--danger)]"><Check size={13} /> Added <Trash2 size={12} /></button> : <button type="button" disabled={buttons.length >= 7} onClick={() => addButton(id)} className="flex items-center gap-1 text-[11px] font-medium text-[var(--brand)] disabled:text-[var(--text-muted)]"><Plus size={13} /> Add button</button>}</div>; })}
              </div>
              <div className="mt-3 space-y-3">
                {buttons.includes("website") && <div><FieldLabel htmlFor="template-website-url">Website URL</FieldLabel><Input id="template-website-url" type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://example.com" /><div className="mt-1 text-[11px] text-[var(--text-secondary)]">Meta URL payload: type URL.</div></div>}
                {buttons.includes("call") && <div><FieldLabel htmlFor="template-phone-number">Phone number</FieldLabel><Input id="template-phone-number" type="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="+14155552671" /><div className="mt-1 text-[11px] text-[var(--text-secondary)]">Include the country code, for example +14155552671.</div></div>}
                {buttons.includes("flow") && <div className="grid gap-3 sm:grid-cols-2"><div><FieldLabel htmlFor="template-flow-id">WhatsApp Flow ID</FieldLabel><Input id="template-flow-id" value={flowId} onChange={(event) => setFlowId(event.target.value)} placeholder="123456789012345" /></div><div><FieldLabel htmlFor="template-flow-screen">Navigation screen ID</FieldLabel><Input id="template-flow-screen" value={flowNavigateScreen} onChange={(event) => setFlowNavigateScreen(event.target.value)} placeholder="WELCOME" /></div></div>}
                {buttons.includes("offer") && <div><FieldLabel htmlFor="template-offer-code">Example offer code</FieldLabel><Input id="template-offer-code" value={offerCodeExample} onChange={(event) => setOfferCodeExample(event.target.value)} placeholder="SAVE25" /><div className="mt-1 text-[11px] text-[var(--text-secondary)]">Meta sends this as a COPY_CODE button. Use it with a coupon or limited-time offer body.</div></div>}
                {buttons.some((button) => ["website", "call", "quick-reply", "flow", "catalog"].includes(button)) && <div className="grid gap-3 sm:grid-cols-2">{buttons.filter((button) => button !== "offer").map((button) => <div key={button}><FieldLabel htmlFor={`template-button-text-${button}`}>Button text · {buttonOptions.find((option) => option.id === button)?.label}</FieldLabel><Input id={`template-button-text-${button}`} value={buttonTexts[button]} onChange={(event) => setButtonTexts((current) => ({ ...current, [button]: event.target.value }))} maxLength={25} placeholder={defaultButtonTexts[button]} /></div>)}</div>}
              </div>
              <div className="mt-3 text-[11px] leading-5 text-[var(--text-secondary)]">Meta supports URL and phone call-to-action buttons, quick replies, Flow, Catalog, and COPY_CODE offer buttons. Some special button types must be submitted alone.</div>
            </section>}
          </section>

          <aside data-testid="template-preview-panel" className="flex-none overflow-hidden rounded-md border border-[var(--border)] bg-white p-5 shadow-[0_3px_12px_rgba(30,40,55,.045)] lg:flex lg:h-full lg:min-h-0 lg:w-[390px] lg:flex-col lg:p-6">
             <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden rounded-md bg-[#f7f9f8] px-3 py-6"><PreviewMessage templateType={templateType} campaignTitle={campaignTitle} headerType={headerType} headerFile={headerFile} body={body} footer={footer} buttons={buttons} carouselCards={carouselCards} limitedOffer={limitedOffer} /></div>
          </aside>
        </div>
      </main>
    </div>
  );
}
