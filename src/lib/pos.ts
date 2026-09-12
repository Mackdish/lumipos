export type MenuItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  is_available: boolean;
};

export type OrderItem = {
  id?: string;
  name: string;
  quantity: number;
  price: number;
};

export const KITCHEN_STATUSES = ["OPEN", "PREPARING", "READY", "SERVED"] as const;
export type KitchenStatus = (typeof KITCHEN_STATUSES)[number];

export const KITCHEN_LABELS: Record<KitchenStatus, string> = {
  OPEN: "Open",
  PREPARING: "Preparing",
  READY: "Ready",
  SERVED: "Served",
};

export function tableLabel(order: { table_number: string | null }) {
  return order.table_number ? `Table ${order.table_number}` : "No table";
}

export type Order = {
  id: string;
  order_number: number;
  customer: string;
  table_number: string | null;
  kitchen_status: string;
  employee_id: string | null;
  employee_name: string;
  payment_method: string;
  payment_status: string;
  order_status: string;
  total: number;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  order_items?: OrderItem[];
};

export function formatMoney(value: number) {
  return `KSh ${Number(value ?? 0).toLocaleString("en-KE")}`;
}

export function orderCode(order: { order_number: number }) {
  return `ORD-${String(order.order_number).padStart(3, "0")}`;
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-KE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}
