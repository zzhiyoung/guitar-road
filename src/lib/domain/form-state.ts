/** 表单动作统一返回结构（供 useActionState 使用） */
export interface FormState {
  status: "idle" | "ok" | "error";
  message?: string;
  /** 动作成功后可携带的跳转目标 */
  redirectTo?: string;
}

export const IDLE_FORM_STATE: FormState = { status: "idle" };

export function errorState(message: string): FormState {
  return { status: "error", message };
}

export function okState(message?: string): FormState {
  return { status: "ok", message };
}

export function readString(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function readOptionalNumber(
  form: FormData,
  key: string,
): number | null {
  const raw = readString(form, key);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function readNumber(form: FormData, key: string, fallback: number): number {
  const n = readOptionalNumber(form, key);
  return n ?? fallback;
}

export function readBool(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}
