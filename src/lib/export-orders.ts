import { supabase } from "@/integrations/supabase/client";

/** Supabase caps a single select at 1000 rows, so the export pages through. */
const PAGE_SIZE = 1000;

const EXPORT_COLUMNS =
  "id, order_number, created_at, customer, employee_name, payment_method, payment_status, total, order_items(id, name, quantity, price)";

export type ExportRange = {
  /** Inclusive lower bound, e.g. "2026-09-01". Omit for "everything". */
  from?: string;
  /** Inclusive upper bound, e.g. "2026-09-18". Omit for "up to now". */
  to?: string;
};

type ExportedOrder = {
  id: string;
  order_number: number;
  created_at: string;
  customer: string | null;
  employee_name: string | null;
  payment_method: string | null;
  payment_status: string | null;
  total: number | string | null;
  order_items: { id: string; name: string; quantity: number; price: number }[] | null;
};

export async function fetchOrdersForExport({ from, to }: ExportRange = {}): Promise<ExportedOrder[]> {
  const orders: ExportedOrder[] = [];

  for (let page = 0; ; page += 1) {
    let query = supabase
      .from("orders")
      .select(EXPORT_COLUMNS)
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
    if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;

    orders.push(...(data as ExportedOrder[]));
    if (data.length < PAGE_SIZE) break;
  }

  return orders;
}

/** Builds and downloads the workbook. Returns how many orders were written. */
export async function exportOrdersToExcel(range: ExportRange = {}): Promise<number> {
  const orders = await fetchOrdersForExport(range);
  if (orders.length === 0) return 0;

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TillBook";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Orders", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Order", key: "order", width: 12 },
    { header: "Date", key: "date", width: 12 },
    { header: "Time", key: "time", width: 8 },
    { header: "Customer", key: "customer", width: 24 },
    { header: "Staff", key: "staff", width: 20 },
    { header: "Payment method", key: "method", width: 16 },
    { header: "Payment status", key: "payment", width: 16 },
    { header: "Items", key: "items", width: 48 },
    { header: "Total (KSh)", key: "total", width: 14, style: { numFmt: "#,##0.00" } },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const order of orders) {
    const created = new Date(order.created_at);

    sheet.addRow({
      order: `ORD-${String(order.order_number).padStart(3, "0")}`,
      date: created.toLocaleDateString("en-KE"),
      time: created.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: false }),
      customer: order.customer ?? "",
      staff: order.employee_name ?? "",
      method: order.payment_method ?? "",
      payment: order.payment_status ?? "",
      items: (order.order_items ?? []).map((item) => `${item.quantity}x ${item.name}`).join(", "),
      total: Number(order.total ?? 0),
    });
  }

  // Paid-only total, so the sheet reconciles against the daily summary screen.
  const paidTotal = orders
    .filter((order) => order.payment_status === "PAID")
    .reduce((sum, order) => sum + Number(order.total ?? 0), 0);

  sheet.addRow({});
  const totalRow = sheet.addRow({ items: "Paid total", total: paidTotal });
  totalRow.font = { bold: true };

  sheet.autoFilter = { from: "A1", to: "I1" };

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    buildFileName(range),
  );

  return orders.length;
}

function buildFileName({ from, to }: ExportRange): string {
  if (!from && !to) return `tillbook-orders-all-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return `tillbook-orders-${from ?? "start"}-to-${to ?? "today"}.xlsx`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Deferred: revoking in the same tick cancels the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}