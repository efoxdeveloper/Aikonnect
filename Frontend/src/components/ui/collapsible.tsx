import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;
function CollapsibleContent({ className, ...props }: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) { return <CollapsiblePrimitive.CollapsibleContent className={`collapsible-content overflow-hidden ${className ?? ""}`} {...props} />; }
export { Collapsible, CollapsibleTrigger, CollapsibleContent };
