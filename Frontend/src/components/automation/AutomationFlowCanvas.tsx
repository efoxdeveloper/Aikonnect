import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { GitBranch, X, Zap } from "lucide-react";
import { ActionCard } from "@/components/automation/ActionCard";
import { ActionSelector } from "@/components/automation/ActionSelector";
import { ConditionsBuilder } from "@/components/automation/ConditionsBuilder";
import { TriggerSelector } from "@/components/automation/TriggerSelector";
import { Drawer, DrawerCloseButton, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { getActionDefinition } from "@/config/automation-actions";
import type { AutomationTriggerDefinition } from "@/config/automation-triggers";
import type { AutomationAction, AutomationCondition, AutomationTriggerType } from "@/types/automation";

type Option = { id: string; label: string };
type NodeTone = "trigger" | "condition" | "action" | "addAction";
type NodeEditor = { type: "trigger" } | { type: "conditions" } | { type: "action"; actionId: string };

type FlowData = {
  label: string;
  trigger?: AutomationTriggerType | null;
  conditions?: AutomationCondition[];
  action?: AutomationAction;
  definition?: AutomationTriggerDefinition;
  onConfigure?: () => void;
  onActionAdd?: (value: AutomationAction["type"]) => void;
  excludeActionTypes?: AutomationAction["type"][];
};

type FlowNode = Node<FlowData>;

const nodeTones: Record<NodeTone, { border: string; icon: string; badge: string; handle: string }> = {
  trigger: {
    border: "border-[#e7c8d8] hover:border-[#df3f86]",
    icon: "bg-[#fff0f7] text-[#d92f78]",
    badge: "bg-[#fff0f7] text-[#d92f78]",
    handle: "!bg-[#df3f86]",
  },
  condition: {
    border: "border-[#ead9b9] hover:border-[#e5a52e]",
    icon: "bg-[#fff7e8] text-[#c77814]",
    badge: "bg-[#fff7e8] text-[#bd7615]",
    handle: "!bg-[#e5a52e]",
  },
  action: {
    border: "border-[#c9d7ed] hover:border-[#527bc0]",
    icon: "bg-[#eef4ff] text-[#416bb4]",
    badge: "bg-[#eef4ff] text-[#416bb4]",
    handle: "!bg-[#527bc0]",
  },
  addAction: {
    border: "border-[#b9d9da] hover:border-[var(--brand)]",
    icon: "bg-[var(--brand-soft)] text-[var(--brand)]",
    badge: "bg-[var(--brand-soft)] text-[var(--brand)]",
    handle: "!bg-[var(--brand)]",
  },
};

function SquareNode({
  tone,
  badge,
  label,
  icon,
  target,
  source,
  onConfigure,
  testId,
}: {
  tone: NodeTone;
  badge: string;
  label: string;
  icon: React.ReactNode;
  target?: boolean;
  source?: boolean;
  onConfigure: () => void;
  testId: string;
}) {
  const colors = nodeTones[tone];
  return <div data-testid={testId} className="relative size-24">
    {target && <Handle type="target" position={Position.Left} className={`!size-2.5 !border-2 !border-white ${colors.handle}`} />}
    <div
      role="button"
      tabIndex={0}
      aria-label={`Configure ${label}`}
      onClick={onConfigure}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onConfigure();
        }
      }}
      className={`node-drag-handle relative flex size-24 cursor-grab items-center justify-center border bg-white shadow-[0_5px_16px_rgba(30,40,55,.10)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(30,40,55,.14)] active:cursor-grabbing ${colors.border}`}
    >
      <span className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[.08em] ${colors.badge}`}>{badge}</span>
      <span className={`flex size-11 items-center justify-center rounded-lg ${colors.icon}`}>{icon}</span>
    </div>
    <div className="pointer-events-none absolute left-1/2 top-[104px] w-[170px] -translate-x-1/2 text-center text-xs font-medium leading-4 text-[var(--text-primary)]">{label}</div>
    {source && <Handle type="source" position={Position.Right} className={`!size-2.5 !border-2 !border-white ${colors.handle}`} />}
  </div>;
}

function TriggerNode({ data }: NodeProps<FlowNode>) {
  return <SquareNode tone="trigger" badge="WHEN" label={data.definition?.label ?? "Select a trigger"} icon={<Zap size={22} />} source onConfigure={data.onConfigure!} testId="automation-trigger-node" />;
}

function ConditionNode({ data }: NodeProps<FlowNode>) {
  const count = data.conditions?.length ?? 0;
  return <SquareNode tone="condition" badge="IF" label={count ? `${count} condition${count === 1 ? "" : "s"}` : "Every occurrence"} icon={<GitBranch size={22} />} target source onConfigure={data.onConfigure!} testId="automation-condition-node" />;
}

function ActionNode({ data }: NodeProps<FlowNode>) {
  if (!data.action) return null;
  const definition = getActionDefinition(data.action.type);
  const ActionIcon = definition?.icon;
  return <SquareNode tone="action" badge="THEN" label={definition?.label ?? data.action.type} icon={ActionIcon ? <ActionIcon size={22} /> : <Zap size={22} />} target source onConfigure={data.onConfigure!} testId={`automation-action-node-${data.action.id}`} />;
}

function AddActionNode({ data }: NodeProps<FlowNode>) {
  const colors = nodeTones.addAction;
  return <div data-testid="automation-add-action-node" className="relative size-24">
    <Handle type="target" position={Position.Left} className={`!size-2.5 !border-2 !border-white ${colors.handle}`} />
    <ActionSelector onChange={data.onActionAdd!} variant="node" excludeTypes={data.excludeActionTypes} />
    <div className="pointer-events-none absolute left-1/2 top-[104px] w-[140px] -translate-x-1/2 text-center text-xs font-medium text-[var(--text-primary)]">Add action</div>
  </div>;
}

const nodeTypes = { trigger: TriggerNode, condition: ConditionNode, action: ActionNode, addAction: AddActionNode };

function EditorPanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <aside className="absolute bottom-4 right-4 top-4 z-20 flex w-[min(520px,calc(100%-32px))] flex-col overflow-hidden border border-[var(--border)] bg-white shadow-[0_18px_50px_rgba(30,40,55,.18)]">
    <header className="flex flex-none items-center justify-between border-b border-[var(--border-soft)] px-4 py-3">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
      <button type="button" aria-label="Close node configuration" onClick={onClose} className="flex size-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand)]"><X size={16} /></button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
  </aside>;
}

function createNodes(props: FlowCanvasProps, onConfigure: (editor: NodeEditor) => void): FlowNode[] {
  const { trigger, conditions, actions, definition, onActionAdd } = props;
  const nodes: FlowNode[] = [
    { id: "trigger", type: "trigger", dragHandle: ".node-drag-handle", position: { x: 40, y: 280 }, data: { label: "WHEN", trigger, definition, onConfigure: () => onConfigure({ type: "trigger" }) } },
    { id: "conditions", type: "condition", dragHandle: ".node-drag-handle", position: { x: 250, y: 280 }, data: { label: "IF", conditions, definition, onConfigure: () => onConfigure({ type: "conditions" }) } },
  ];
  actions.forEach((action, index) => nodes.push({
    id: `action-${action.id}`,
    type: "action",
    dragHandle: ".node-drag-handle",
    position: { x: 460 + index * 210, y: 280 },
    data: { label: action.type, action, onConfigure: () => onConfigure({ type: "action", actionId: action.id }) },
  }));
  nodes.push({ id: "add-action", type: "addAction", position: { x: 460 + actions.length * 210, y: 280 }, data: { label: "Add action", onActionAdd, excludeActionTypes: props.excludeActionTypes } });
  return nodes;
}

function createEdges(actions: AutomationAction[]): Edge[] {
  const edges: Edge[] = [{ id: "trigger-conditions", source: "trigger", target: "conditions", type: "smoothstep" }];
  actions.forEach((action, index) => {
    const source = index === 0 ? "conditions" : `action-${actions[index - 1]?.id}`;
    edges.push({ id: `${source}-${action.id}`, source, target: `action-${action.id}`, type: "smoothstep" });
  });
  const source = actions.length ? `action-${actions[actions.length - 1]?.id}` : "conditions";
  edges.push({ id: `${source}-add-action`, source, target: "add-action", type: "smoothstep" });
  return edges;
}

export function AutomationFlowCanvas(props: FlowCanvasProps) {
  const { actions } = props;
  const [editor, setEditor] = useState<NodeEditor | null>(null);
  const onConfigure = useCallback((next: NodeEditor) => setEditor(next), []);
  const initialNodes = useMemo(() => createNodes(props, onConfigure), []);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(createEdges(actions));

  useEffect(() => {
    setNodes((current) => createNodes(props, onConfigure).map((next) => ({ ...next, position: next.id === "add-action" ? next.position : current.find((item) => item.id === next.id)?.position ?? next.position })));
    setEdges(createEdges(actions));
  }, [actions, onConfigure, props.trigger, props.conditions, props.definition, setEdges, setNodes]);

  const selectedAction = editor?.type === "action" ? actions.find((action) => action.id === editor.actionId) : undefined;
  const onInit = useCallback((instance: { fitView: (options?: { padding?: number }) => void }) => {
    window.requestAnimationFrame(() => instance.fitView({ padding: 0.25 }));
  }, []);

  return <div data-testid="automation-flow-canvas" className="relative h-full min-h-0 overflow-hidden bg-[#fbfcfd] [&_.react-flow__attribution]:hidden">
    <ReactFlow
      nodes={nodes}
      edges={edges}
      defaultNodes={nodes}
      defaultEdges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onInit={onInit}
      onlyRenderVisibleElements={false}
      nodesConnectable={false}
      edgesReconnectable={false}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.35}
      maxZoom={1.5}
      defaultEdgeOptions={{ animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: "#aebabe", width: 16, height: 16 }, style: { stroke: "#aebabe", strokeWidth: 1.5 } }}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1.4} color="#cbd3d6" />
      <Controls position="bottom-left" showInteractive={false} />
    </ReactFlow>

    <TriggerSelector value={props.trigger} open={editor?.type === "trigger"} hideTrigger onOpenChange={(open) => { if (!open && editor?.type === "trigger") setEditor(null); }} onChange={(trigger) => { props.onTriggerChange(trigger); setEditor(null); }} />
    <Drawer open={editor?.type === "conditions"} onOpenChange={(open) => { if (!open && editor?.type === "conditions") setEditor(null); }} direction="right">
      <DrawerContent className="h-full max-h-screen">
        <DrawerHeader className="relative flex-none border-b border-[var(--border-soft)] pr-14">
          <DrawerTitle>Conditions</DrawerTitle>
          <DrawerCloseButton />
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4"><ConditionsBuilder conditions={props.conditions} definition={props.definition} onChange={props.onConditionsChange} /></div>
      </DrawerContent>
    </Drawer>
    {editor?.type === "action" && selectedAction && <EditorPanel title={getActionDefinition(selectedAction.type)?.label ?? "Configure action"} onClose={() => setEditor(null)}><ActionCard action={selectedAction} index={selectedAction.order - 1} total={actions.length} templates={props.templates} tags={props.tags} members={props.members} customFields={props.customFields} onChange={props.onActionChange} onMove={(direction) => props.onActionMove(selectedAction.order - 1, direction)} onDuplicate={() => props.onActionDuplicate(selectedAction.order - 1)} onRemove={() => { props.onActionRemove(selectedAction.id); setEditor(null); }} /></EditorPanel>}
  </div>;
}

type FlowCanvasProps = {
  trigger: AutomationTriggerType | null;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  definition?: AutomationTriggerDefinition;
  templates: Option[];
  tags: Option[];
  members: Option[];
  customFields: string[];
  onTriggerChange: (value: AutomationTriggerType) => void;
  onConditionsChange: (value: AutomationCondition[]) => void;
  onActionChange: (value: AutomationAction) => void;
  onActionAdd: (value: AutomationAction["type"]) => void;
  onActionMove: (index: number, direction: -1 | 1) => void;
  onActionDuplicate: (index: number) => void;
  onActionRemove: (id: string) => void;
  excludeActionTypes?: AutomationAction["type"][];
};
