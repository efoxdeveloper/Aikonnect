import type { Request, Response } from "express";
import type { ReportKey, ReportQuery } from "./report.schemas.js";
import * as service from "./report.service.js";

export async function get(request: Request, response: Response) { response.status(200).json({ success: true, data: await service.getReport(request.params.workspaceId as string, request.params.report as ReportKey, request.validatedQuery as ReportQuery) }); }
export async function exportReport(request: Request, response: Response) { const report = request.params.report as ReportKey; const data = await service.getReport(request.params.workspaceId as string, report, request.validatedQuery as ReportQuery); response.status(200).type("text/csv").setHeader("Content-Disposition", `attachment; filename="${report}-report.csv"`).send(service.reportCsv(data)); }
