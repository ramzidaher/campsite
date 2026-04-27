import csv
from pathlib import Path
from openpyxl import Workbook

REPO_ROOT = Path("/Users/ramzidaher/Projects/CampSite")
DOCS_DIR = REPO_ROOT / "docs"

ROUTES_CSV_PATH = DOCS_DIR / "full-frontend-qa-v2-routes.csv"
INVENTORY_MD_PATH = DOCS_DIR / "full-frontend-feature-test-inventory.md"
MASTER_TODO_MD_PATH = DOCS_DIR / "full-saas-audit-master-todo.md"

ROLE_EXPANDED_CSV_PATH = DOCS_DIR / "full-frontend-qa-v3-role-matrix.csv"
WORKBOOK_OUTPUT_PATH = DOCS_DIR / "full-frontend-qa-source-of-truth.xlsx"


def read_csv_rows(path: Path):
    with path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.reader(f))


def write_csv_rows(path: Path, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(rows)


def markdown_to_rows(md_path: Path):
    lines = md_path.read_text(encoding="utf-8").splitlines()
    rows = [["line_no", "markdown_text"]]
    for i, line in enumerate(lines, start=1):
        rows.append([i, line])
    return rows


def expand_roles(base_rows):
    header = base_rows[0]
    idx_role = header.index("role_matrix")
    idx_test = header.index("test_id")
    idx_status = header.index("status")

    out = [header + ["expanded_role", "expanded_case_id", "execution_status", "bug_id"]]
    for row in base_rows[1:]:
        role_matrix = (row[idx_role] if idx_role < len(row) else "").strip()
        roles = [r.strip() for r in role_matrix.split("|") if r.strip()]

        if not roles:
            out.append(
                row
                + [
                    "",
                    f"{row[idx_test] if idx_test < len(row) else 'NO_ID'}-NOROLE",
                    (row[idx_status] if idx_status < len(row) else "NOT_TESTED") or "NOT_TESTED",
                    "",
                ]
            )
            continue

        for role in roles:
            out.append(
                row
                + [
                    role,
                    f"{row[idx_test]}-{role.replace(' ', '_').upper()}",
                    (row[idx_status] if idx_status < len(row) else "NOT_TESTED") or "NOT_TESTED",
                    "",
                ]
            )
    return out


def summary_rows(base_rows, expanded_rows):
    header = base_rows[0]
    idx_feature = header.index("feature_area")
    idx_route = header.index("route")
    unique_features = len({r[idx_feature] for r in base_rows[1:] if idx_feature < len(r) and r[idx_feature]})
    unique_routes = len({r[idx_route] for r in base_rows[1:] if idx_route < len(r) and r[idx_route]})

    return [
        ["metric", "value"],
        ["base_test_rows", len(base_rows) - 1],
        ["expanded_role_rows", len(expanded_rows) - 1],
        ["unique_routes", unique_routes],
        ["unique_feature_areas", unique_features],
        ["source_routes_csv", "docs/full-frontend-qa-v2-routes.csv"],
        ["source_inventory_md", "docs/full-frontend-feature-test-inventory.md"],
        ["source_master_todo_md", "docs/full-saas-audit-master-todo.md"],
    ]


def add_sheet(workbook: Workbook, title: str, rows):
    ws = workbook.create_sheet(title=title)
    for row in rows:
        ws.append(row)


def main():
    base_rows = read_csv_rows(ROUTES_CSV_PATH)
    expanded_rows = expand_roles(base_rows)
    inventory_rows = markdown_to_rows(INVENTORY_MD_PATH)
    master_todo_rows = markdown_to_rows(MASTER_TODO_MD_PATH)
    coverage_rows = summary_rows(base_rows, expanded_rows)

    write_csv_rows(ROLE_EXPANDED_CSV_PATH, expanded_rows)

    wb = Workbook()
    default = wb.active
    wb.remove(default)

    add_sheet(wb, "QA_Routes_V2", base_rows)
    add_sheet(wb, "QA_By_Role_V3", expanded_rows)
    add_sheet(wb, "Feature_Inventory_MD", inventory_rows)
    add_sheet(wb, "Master_TODO_MD", master_todo_rows)
    add_sheet(wb, "Coverage_Summary", coverage_rows)

    wb.save(WORKBOOK_OUTPUT_PATH)
    print(f"Wrote {ROLE_EXPANDED_CSV_PATH}")
    print(f"Wrote {WORKBOOK_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
