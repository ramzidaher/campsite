import fs from "node:fs/promises";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const repoRoot = "/Users/ramzidaher/Projects/CampSite";
const docsDir = path.join(repoRoot, "docs");

const routesCsvPath = path.join(docsDir, "full-frontend-qa-v2-routes.csv");
const inventoryMdPath = path.join(docsDir, "full-frontend-feature-test-inventory.md");
const masterTodoMdPath = path.join(docsDir, "full-saas-audit-master-todo.md");

const roleExpandedCsvPath = path.join(docsDir, "full-frontend-qa-v3-role-matrix.csv");
const workbookOutputPath = path.join(docsDir, "full-frontend-qa-source-of-truth.xlsx");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // no-op (handled by \n)
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function escapeCsvField(value) {
  const v = String(value ?? "");
  if (v.includes('"') || v.includes(",") || v.includes("\n")) {
    return `"${v.replaceAll('"', '""')}"`;
  }
  return v;
}

function toCsv(rows) {
  return rows.map((r) => r.map(escapeCsvField).join(",")).join("\n") + "\n";
}

function markdownToCsv(mdText) {
  const lines = mdText.split(/\r?\n/);
  const rows = [["line_no", "markdown_text"]];
  for (let i = 0; i < lines.length; i += 1) {
    rows.push([String(i + 1), lines[i]]);
  }
  return toCsv(rows);
}

function expandRoleMatrixRows(baseRows) {
  const header = baseRows[0];
  const roleMatrixIdx = header.indexOf("role_matrix");
  const testIdIdx = header.indexOf("test_id");
  const routeIdx = header.indexOf("route");
  const featureIdx = header.indexOf("feature_area");
  const statusIdx = header.indexOf("status");

  const out = [[
    ...header,
    "expanded_role",
    "expanded_case_id",
    "execution_status",
    "bug_id",
  ]];

  for (let i = 1; i < baseRows.length; i += 1) {
    const row = baseRows[i];
    if (!row || row.length === 0) continue;

    const roleMatrix = row[roleMatrixIdx] ?? "";
    const roles = roleMatrix
      .split("|")
      .map((r) => r.trim())
      .filter(Boolean);

    if (roles.length === 0) {
      out.push([
        ...row,
        "",
        `${row[testIdIdx] || "NO_ID"}-NOROLE`,
        row[statusIdx] || "NOT_TESTED",
        "",
      ]);
      continue;
    }

    for (const role of roles) {
      out.push([
        ...row,
        role,
        `${row[testIdIdx] || "NO_ID"}-${role.replaceAll(" ", "_").toUpperCase()}`,
        row[statusIdx] || "NOT_TESTED",
        "",
      ]);
    }
  }

  return out;
}

function summaryCsv(baseRows, expandedRows) {
  const baseCount = Math.max(0, baseRows.length - 1);
  const expandedCount = Math.max(0, expandedRows.length - 1);
  const uniqueRoutes = new Set(baseRows.slice(1).map((r) => r[2]).filter(Boolean)).size;
  const uniqueFeatures = new Set(baseRows.slice(1).map((r) => r[1]).filter(Boolean)).size;

  return toCsv([
    ["metric", "value"],
    ["base_test_rows", String(baseCount)],
    ["expanded_role_rows", String(expandedCount)],
    ["unique_routes", String(uniqueRoutes)],
    ["unique_feature_areas", String(uniqueFeatures)],
    ["source_routes_csv", "docs/full-frontend-qa-v2-routes.csv"],
    ["source_inventory_md", "docs/full-frontend-feature-test-inventory.md"],
    ["source_master_todo_md", "docs/full-saas-audit-master-todo.md"],
  ]);
}

async function main() {
  const [routesCsvText, inventoryMd, masterTodoMd] = await Promise.all([
    fs.readFile(routesCsvPath, "utf8"),
    fs.readFile(inventoryMdPath, "utf8"),
    fs.readFile(masterTodoMdPath, "utf8"),
  ]);

  const baseRows = parseCsv(routesCsvText);
  const expandedRows = expandRoleMatrixRows(baseRows);
  const expandedCsv = toCsv(expandedRows);
  await fs.writeFile(roleExpandedCsvPath, expandedCsv, "utf8");

  const workbook = Workbook.create();
  await workbook.fromCSV(routesCsvText, { sheetName: "QA_Routes_V2" });
  await workbook.fromCSV(expandedCsv, { sheetName: "QA_By_Role_V3" });
  await workbook.fromCSV(markdownToCsv(inventoryMd), { sheetName: "Feature_Inventory_MD" });
  await workbook.fromCSV(markdownToCsv(masterTodoMd), { sheetName: "Master_TODO_MD" });
  await workbook.fromCSV(summaryCsv(baseRows, expandedRows), { sheetName: "Coverage_Summary" });

  const xlsx = await SpreadsheetFile.exportXlsx(workbook);
  await xlsx.save(workbookOutputPath);

  console.log(`Wrote ${roleExpandedCsvPath}`);
  console.log(`Wrote ${workbookOutputPath}`);
}

await main();
