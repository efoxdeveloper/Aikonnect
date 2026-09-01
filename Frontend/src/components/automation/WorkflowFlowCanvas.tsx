import { useCallback, useEffect, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useUpdateNodeInternals,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  GitBranch,
  MessageCircle,
  MoreVertical,
  Play,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { ActionCard } from "@/components/automation/ActionCard";
import {
  ConditionEditor,
  QuestionEditor,
} from "@/components/automation/WorkflowBranchBuilder";
import { ConditionsBuilder } from "@/components/automation/ConditionsBuilder";
import { TriggerSelector } from "@/components/automation/TriggerSelector";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerCloseButton,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { getActionDefinition } from "@/config/automation-actions";
import {
  getTriggerDefinition,
  type AutomationTriggerDefinition,
} from "@/config/automation-triggers";
import type {
  AutomationAction,
  AutomationActionType,
  AutomationCondition,
  AutomationTriggerType,
} from "@/types/automation";
import type {
  WorkflowActionStep,
  WorkflowDecisionStep,
  WorkflowEdge,
  WorkflowNodePosition,
  WorkflowQuestion,
  WorkflowStep,
} from "@/types/workflow";

type Option = { id: string; label: string };
type BranchDefinition = { key: string; label: string };
export type WorkflowCanvasNodeKind =
  | "QUESTION"
  | "CONDITION"
  | AutomationActionType;
type CanvasEditor =
  | { type: "trigger" }
  | { type: "conditions" }
  | { type: "decision"; id: string }
  | { type: "action"; id: string }
  | null;
type CanvasData = Record<string, unknown> & {
  kind: "start" | "decision" | "action";
  title: string;
  body?: string;
  testId?: string;
  tone?: "green" | "orange" | "purple" | "red" | "blue";
  branches?: BranchDefinition[];
  onOpen?: () => void;
  onOpenSecondary?: () => void;
};
type CanvasNode = Node<CanvasData>;
type Props = {
  trigger: AutomationTriggerType | null;
  conditions: AutomationCondition[];
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
  definition?: AutomationTriggerDefinition;
  templates: Option[];
  tags: Option[];
  members: Option[];
  customFields: string[];
  onTriggerChange: (value: AutomationTriggerType) => void;
  onConditionsChange: (value: AutomationCondition[]) => void;
  onNodeAdd: (
    type: WorkflowCanvasNodeKind,
    position: WorkflowNodePosition,
    autoConnect: boolean,
  ) => void;
  onDecisionChange: (value: WorkflowDecisionStep) => void;
  onStepChange: (value: AutomationAction) => void;
  onEdgeConnect: (value: WorkflowEdge) => void;
  onEdgesRemove: (ids: string[]) => void;
  onNodeMove: (id: string, position: WorkflowNodePosition) => void;
  onStepMove: (id: string, direction: -1 | 1) => void;
  onStepDuplicate: (id: string) => void;
  onStepRemove: (id: string) => void;
};

const toneClasses = {
  green: "bg-[#1cab67]",
  orange: "bg-[#ff982f]",
  purple: "bg-[#6b7edb]",
  red: "bg-[#ef5b6c]",
  blue: "bg-[#57a8e6]",
};

function optionKey(label: string, index: number) {
  const value = label.trim().toLowerCase();
  if (value === "yes") return "YES";
  if (value === "no") return "NO";
  return `OPTION_${index}`;
}
function decisionBranches(decision: WorkflowDecisionStep): BranchDefinition[] {
  if (decision.type === "ASK_QUESTION") {
    return decision.config.mode === "TEXT"
      ? [{ key: "NEXT", label: "Response received" }]
      : decision.config.options.map((label, index) => ({
          key: optionKey(label, index),
          label: label || `Option ${index + 1}`,
        }));
  }
  return [
    { key: "TRUE", label: decision.config.trueLabel || "True" },
    { key: "FALSE", label: decision.config.falseLabel || "False" },
  ];
}
function isDecision(step: WorkflowStep): step is WorkflowDecisionStep {
  return step.type === "ASK_QUESTION" || step.type === "SET_CONDITION";
}
function isAction(step: WorkflowStep): step is WorkflowActionStep {
  return !isDecision(step);
}
function defaultPosition(index: number): WorkflowNodePosition {
  return {
    x: 390 + (index % 3) * 330,
    y: 90 + Math.floor(index / 3) * 260,
  };
}

function CardNode({ data, selected }: NodeProps<CanvasNode>) {
  return (
    <article
      data-testid={data.testId}
      className={`w-[255px] overflow-hidden rounded-md border bg-white shadow-[0_6px_18px_rgba(30,40,55,.12)] ${selected ? "border-[#38a169] ring-2 ring-[#38a169]/20" : "border-[#dfe3e8]"}`}
    >
      {data.kind !== "start" && (
        <Handle
          type="target"
          position={Position.Left}
          className="!size-3 !border-2 !border-white !bg-[#aeb8bc]"
        />
      )}
      <header
        className={`node-drag-handle flex cursor-grab items-center gap-2 px-3 py-2.5 text-white ${toneClasses[data.tone ?? "blue"]}`}
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-white/25">
          {data.kind === "start" ? (
            <Play size={14} />
          ) : (
            <MessageCircle size={14} />
          )}
        </span>
        <strong className="min-w-0 flex-1 truncate text-xs font-semibold">
          {data.title}
        </strong>
        <MoreVertical size={15} />
      </header>
      <div className="p-3">
        <div className="min-h-8 whitespace-pre-line text-[11px] leading-5 text-[var(--text-primary)]">
          {data.body || "Click edit to configure this node."}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={data.onOpen}
            className="nodrag text-[11px] font-semibold text-[#1769aa] hover:underline"
          >
            Edit
          </button>
          {data.onOpenSecondary && (
            <button
              type="button"
              onClick={data.onOpenSecondary}
              className="nodrag text-[11px] font-semibold text-[#1769aa] hover:underline"
            >
              Filters
            </button>
          )}
        </div>
      </div>
      <Handle
        id="NEXT"
        type="source"
        position={Position.Right}
        className="!size-3 !border-2 !border-white !bg-[#aeb8bc]"
      />
    </article>
  );
}

function DecisionNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const branches = data.branches ?? [];
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateNodeInternals(id);
  }, [branches, id, updateNodeInternals]);
  return (
    <article
      data-testid={data.testId}
      className={`w-[255px] overflow-hidden rounded-md border bg-white shadow-[0_6px_18px_rgba(30,40,55,.12)] ${selected ? "border-[#ff982f] ring-2 ring-[#ff982f]/20" : "border-[#dfe3e8]"}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-3 !border-2 !border-white !bg-[#ff982f]"
      />
      <header
        className={`node-drag-handle flex cursor-grab items-center gap-2 px-3 py-2.5 text-white ${toneClasses[data.tone ?? "orange"]}`}
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-white/25">
          ?
        </span>
        <strong className="min-w-0 flex-1 truncate text-xs font-semibold">
          {data.title}
        </strong>
        <MoreVertical size={15} />
      </header>
      <div className="p-3">
        <div className="whitespace-pre-line text-[11px] leading-5 text-[var(--text-primary)]">
          {data.body || "Configure this decision."}
        </div>
        <button
          type="button"
          onClick={data.onOpen}
          className="nodrag mt-2 text-[11px] font-semibold text-[#1769aa] hover:underline"
        >
          Edit
        </button>
        <div className="mt-3 space-y-1.5">
          {branches.map((branch) => (
            <div
              key={branch.key}
              data-testid={`workflow-${branch.key.toLowerCase()}-branch`}
              className="relative rounded bg-[#f4f6f8] px-2 py-1.5 text-[10px] font-medium text-[var(--text-secondary)]"
            >
              {branch.label}
              <Handle
                id={branch.key}
                type="source"
                position={Position.Right}
                className="!size-3 !border-2 !border-white !bg-[#ff982f]"
              />
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

const nodeTypes = { card: CardNode, decision: DecisionNode };

function buildNodes(props: Props, setEditor: (editor: CanvasEditor) => void) {
  const triggerDefinition =
    props.definition ?? getTriggerDefinition(props.trigger ?? undefined);
  const nodes: CanvasNode[] = [
    {
      id: "start",
      type: "card",
      dragHandle: ".node-drag-handle",
      deletable: false,
      position: { x: 60, y: 240 },
      data: {
        kind: "start",
        title: "Starting Step",
        body: `${triggerDefinition?.label ?? "Select an entry trigger"}\n${props.conditions.length ? `${props.conditions.length} start filter(s)` : "All matching contacts"}`,
        tone: "green",
        testId: "workflow-entry-card",
        onOpen: () => setEditor({ type: "trigger" }),
        onOpenSecondary: () => setEditor({ type: "conditions" }),
      },
    },
  ];
  props.steps.forEach((step, index) => {
    if (isDecision(step)) {
      nodes.push({
        id: step.id,
        type: "decision",
        dragHandle: ".node-drag-handle",
        position: step.position ?? defaultPosition(index),
        data: {
          kind: "decision",
          title: step.type === "ASK_QUESTION" ? "Question" : "Condition",
          body:
            step.type === "ASK_QUESTION"
              ? step.config.question || "Question not configured"
              : `${step.config.field || "Field not configured"} ${step.config.operator} ${String(step.config.value ?? "")}`,
          tone: step.type === "ASK_QUESTION" ? "orange" : "purple",
          branches: decisionBranches(step),
          testId: `workflow-decision-${step.id}`,
          onOpen: () => setEditor({ type: "decision", id: step.id }),
        },
      });
      return;
    }
    const definition = getActionDefinition(step.type);
    nodes.push({
      id: step.id,
      type: "card",
      dragHandle: ".node-drag-handle",
      position: step.position ?? defaultPosition(index),
      data: {
        kind: "action",
        title: definition?.label ?? step.type,
        body: String(
          step.config.message ?? definition?.description ?? "Configure action",
        ),
        tone: "red",
        testId: `workflow-action-${step.id}`,
        onOpen: () => setEditor({ type: "action", id: step.id }),
      },
    });
  });
  return nodes;
}

function buildEdges(edges: WorkflowEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source === "trigger" ? "start" : edge.source,
    sourceHandle: edge.condition,
    target: edge.target,
    type: "smoothstep",
    label: edge.condition === "NEXT" ? undefined : edge.condition,
  }));
}

function EditorPanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <aside className="absolute bottom-4 right-4 top-4 z-20 flex w-[min(480px,calc(100%-32px))] flex-col overflow-hidden rounded-md border border-[var(--border)] bg-white shadow-[0_18px_50px_rgba(30,40,55,.18)]">
      <header className="flex flex-none items-center justify-between border-b border-[var(--border-soft)] px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          type="button"
          aria-label="Close node configuration"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-md hover:bg-[var(--brand-soft)]"
        >
          <X size={16} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}

export function WorkflowFlowCanvas(props: Props) {
  const [editor, setEditor] = useState<CanvasEditor>(null);
  const [flow, setFlow] = useState<ReactFlowInstance<CanvasNode, Edge> | null>(
    null,
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(
    buildNodes(props, setEditor),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    buildEdges(props.edges),
  );
  const selectedDecision =
    editor?.type === "decision"
      ? props.steps.find(
          (step): step is WorkflowDecisionStep =>
            isDecision(step) && step.id === editor.id,
        )
      : undefined;
  const selectedAction =
    editor?.type === "action"
      ? props.steps.find(
          (step): step is WorkflowActionStep =>
            isAction(step) && step.id === editor.id,
        )
      : undefined;

  useEffect(() => {
    setNodes(buildNodes(props, setEditor));
  }, [
    props.trigger,
    props.conditions,
    props.steps,
    props.definition,
    setNodes,
  ]);
  useEffect(() => {
    setEdges(buildEdges(props.edges));
  }, [props.edges, setEdges]);

  const addPaletteNode = useCallback(
    (
      kind: WorkflowCanvasNodeKind,
      position?: WorkflowNodePosition,
      autoConnect = true,
    ) => {
      props.onNodeAdd(
        kind,
        position ?? defaultPosition(props.steps.length),
        autoConnect,
      );
    },
    [props],
  );
  const drop = (event: React.DragEvent) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData(
      "application/workflow-node",
    ) as WorkflowCanvasNodeKind;
    if (!kind) return;
    const position = flow?.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    addPaletteNode(kind, position, false);
  };
  const connect = (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const source =
      connection.source === "start" ? "trigger" : connection.source;
    const condition = connection.sourceHandle ?? "NEXT";
    props.onEdgeConnect({
      id: `edge_${source}_${condition}_${connection.target}_${Date.now()}`,
      source,
      target: connection.target,
      condition,
    });
  };
  const validConnection = (connection: Edge | Connection) => {
    if (
      !connection.source ||
      !connection.target ||
      connection.target === "start" ||
      connection.source === connection.target
    )
      return false;
    const source =
      connection.source === "start" ? "trigger" : connection.source;
    const condition = connection.sourceHandle ?? "NEXT";
    return !props.edges.some(
      (edge) =>
        edge.source === source &&
        edge.condition === condition &&
        edge.target === connection.target,
    );
  };
  const paletteItem = (
    kind: WorkflowCanvasNodeKind,
    title: string,
    description: string,
    tone: string,
  ) => (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("application/workflow-node", kind);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => addPaletteNode(kind)}
      className={`w-full rounded-md p-3 text-left text-white shadow-sm ${tone}`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-[11px] leading-4">{description}</div>
    </button>
  );

  return (
    <div
      data-testid="workflow-flow-canvas"
      className="flex h-full min-h-0 overflow-hidden"
    >
      <aside
        data-testid="workflow-node-palette"
        className="hidden w-[260px] shrink-0 overflow-y-auto border-r border-[#e3e6ee] bg-white px-5 py-4 lg:block"
      >
        <div className="mb-4 flex items-center gap-2 border-b border-[var(--border-soft)] pb-3">
          <Zap size={17} className="text-[#1cab67]" />
          <span className="text-sm font-semibold">Chatbot nodes</span>
        </div>
        <div className="mb-4 grid grid-cols-4 gap-1 border-b border-[var(--border-soft)] pb-4 text-center text-[16px]">
          <span>◉</span>
          <span>◎</span>
          <span>◈</span>
          <span>♪</span>
        </div>
        <div className="space-y-3">
          {paletteItem(
            "SEND_MESSAGE",
            "Send a message",
            "With no response required from visitor",
            "bg-[#ef5b6c]",
          )}
          {paletteItem(
            "QUESTION",
            "Ask a question",
            "Ask question and store user input in variable",
            "bg-[#ff982f]",
          )}
          {paletteItem(
            "CONDITION",
            "Set a condition",
            "Route visitors using logical conditions",
            "bg-[#6b7edb]",
          )}
        </div>
        <div className="mt-6 border-t border-[var(--border-soft)] pt-4">
          <div className="mb-3 text-sm font-semibold">Operations</div>
          <div className="grid grid-cols-2 gap-3">
            {paletteItem(
              "ADD_TAG",
              "Subscribe",
              "Add a contact tag",
              "bg-[#f0a64b]",
            )}
            {paletteItem(
              "REMOVE_TAG",
              "Unsubscribe",
              "Remove a contact tag",
              "bg-[#e68b54]",
            )}
            {paletteItem(
              "UPDATE_CUSTOM_FIELD",
              "Update Attribute",
              "Change contact data",
              "bg-[#55a6c8]",
            )}
          </div>
        </div>
        <div className="mt-5 rounded-md border border-[#dbe4e6] bg-[#f7fafb] p-3 text-[11px] leading-5 text-[var(--text-secondary)]">
          Drag nodes onto the canvas, then connect their handles to build any
          conversation path.
        </div>
      </aside>
      <main
        className="relative min-h-0 min-w-0 flex-1"
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={drop}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={setFlow}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={(_event, node) =>
            node.id !== "start" && props.onNodeMove(node.id, node.position)
          }
          onNodesDelete={(deleted) =>
            deleted.forEach(
              (node) => node.id !== "start" && props.onStepRemove(node.id),
            )
          }
          onEdgesDelete={(deleted) =>
            props.onEdgesRemove(deleted.map((edge) => edge.id))
          }
          onConnect={connect}
          isValidConnection={validConnection}
          nodesConnectable
          edgesReconnectable={false}
          onlyRenderVisibleElements={false}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.25}
          maxZoom={1.6}
          defaultEdgeOptions={{
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: "#aeb8bc",
              width: 15,
              height: 15,
            },
            style: {
              stroke: "#aeb8bc",
              strokeWidth: 1.5,
              strokeDasharray: "5 4",
            },
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Lines}
            gap={42}
            size={1}
            color="#e1e5ec"
          />
          <Controls position="bottom-left" showInteractive={false} />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            nodeColor={(node) =>
              node.type === "decision"
                ? "#ff982f"
                : node.id === "start"
                  ? "#1cab67"
                  : "#ef5b6c"
            }
          />
        </ReactFlow>
        <TriggerSelector
          value={props.trigger}
          open={editor?.type === "trigger"}
          hideTrigger
          onOpenChange={(open) => {
            if (!open && editor?.type === "trigger") setEditor(null);
          }}
          onChange={(value) => {
            props.onTriggerChange(value);
            setEditor(null);
          }}
        />
        <Drawer
          open={editor?.type === "conditions"}
          onOpenChange={(open) => {
            if (!open && editor?.type === "conditions") setEditor(null);
          }}
          direction="right"
        >
          <DrawerContent className="h-full max-h-screen">
            <DrawerHeader className="relative flex-none border-b border-[var(--border-soft)] pr-14">
              <DrawerTitle>Start filters</DrawerTitle>
              <DrawerDescription>
                Choose who can enter this chatbot.
              </DrawerDescription>
              <DrawerCloseButton />
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <ConditionsBuilder
                conditions={props.conditions}
                definition={props.definition}
                onChange={props.onConditionsChange}
              />
            </div>
            <DrawerFooter className="flex-none border-t border-[var(--border-soft)] p-4">
              <DrawerClose asChild>
                <Button type="button" className="h-9 text-xs">
                  Done
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
        {selectedDecision && (
          <Drawer
            open={editor?.type === "decision"}
            onOpenChange={(open) => {
              if (!open && editor?.type === "decision") setEditor(null);
            }}
            direction="right"
          >
            <DrawerContent className="h-full max-h-screen">
              <DrawerHeader className="relative flex-none border-b border-[var(--border-soft)] pr-14">
                <DrawerTitle>
                  {selectedDecision.type === "ASK_QUESTION"
                    ? "Ask a question"
                    : "Set a condition"}
                </DrawerTitle>
                <DrawerDescription>
                  Configure this chatbot node and its output paths.
                </DrawerDescription>
                <DrawerCloseButton />
              </DrawerHeader>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {selectedDecision.type === "ASK_QUESTION" ? (
                  <QuestionEditor
                    question={selectedDecision as WorkflowQuestion}
                    onChange={props.onDecisionChange}
                  />
                ) : (
                  <ConditionEditor
                    condition={selectedDecision}
                    onChange={props.onDecisionChange}
                  />
                )}
              </div>
              <DrawerFooter className="flex-none flex-row justify-between border-t border-[var(--border-soft)] p-4">
                <button
                  type="button"
                  aria-label="Delete chatbot node"
                  onClick={() => {
                    props.onStepRemove(selectedDecision.id);
                    setEditor(null);
                  }}
                  className="flex h-9 items-center gap-2 rounded-md px-3 text-xs font-medium text-[var(--danger)] hover:bg-red-50"
                >
                  <Trash2 size={14} /> Delete
                </button>
                <DrawerClose asChild>
                  <Button type="button" className="h-9 text-xs">
                    Done
                  </Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        )}
        {selectedAction && (
          <EditorPanel
            title={
              getActionDefinition(selectedAction.type)?.label ??
              "Configure action"
            }
            onClose={() => setEditor(null)}
          >
            <ActionCard
              action={selectedAction}
              index={Math.max(
                0,
                props.steps.findIndex((step) => step.id === selectedAction.id),
              )}
              total={props.steps.length}
              templates={props.templates}
              tags={props.tags}
              members={props.members}
              customFields={props.customFields}
              onChange={props.onStepChange}
              onMove={(direction) =>
                props.onStepMove(selectedAction.id, direction)
              }
              onDuplicate={() => props.onStepDuplicate(selectedAction.id)}
              onRemove={() => {
                props.onStepRemove(selectedAction.id);
                setEditor(null);
              }}
            />
          </EditorPanel>
        )}
      </main>
    </div>
  );
}
