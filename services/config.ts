// Centralized runtime configuration sourced from environment variables.

function int(value: string | undefined, fallback: number): number {
	const parsed = parseInt(value ?? "", 10);
	return Number.isNaN(parsed) ? fallback : parsed;
}

function hourList(value: string | undefined, fallback: number[]): number[] {
	if (!value) return fallback;
	const hours = value
		.split(",")
		.map((h) => parseInt(h.trim(), 10))
		.filter((h) => !Number.isNaN(h) && h >= 0 && h <= 23);
	return hours.length > 0 ? hours : fallback;
}

// --- MQTT ---
/** MQTT topic namespace prefix, e.g. `<prefix>/alert/<deviceId>`. */
export const TOPIC_PREFIX = process.env.MQTT_TOPIC_PREFIX || "gajahsafe";
export const MQTT_BROKER_URL =
	process.env.MQTT_BROKER_URL || "mqtt://localhost:8883";
export const MQTT_USERNAME = process.env.MQTT_USER;
export const MQTT_PASSWORD = process.env.MQTT_PWD;
/** Verify the broker's TLS certificate. Set MQTT_REJECT_UNAUTHORIZED=false to disable (not recommended). */
export const MQTT_REJECT_UNAUTHORIZED =
	process.env.MQTT_REJECT_UNAUTHORIZED !== "false";

// --- Telegram ---
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
export const TELEGRAM_HEARTBEAT_CHANNEL_ID =
	process.env.TELEGRAM_HEARTBEAT_CHANNEL_ID || "-5248562860";

// --- Localization ---
export const TIMEZONE = process.env.TIMEZONE || "Asia/Kuala_Lumpur";
export const LOCALE = process.env.LOCALE || "en-MY";

// --- Branding ---
export const APP_NAME = process.env.APP_NAME || "GajahSafe";
export const APP_EMOJI = process.env.APP_EMOJI || "🐘";

// --- Scheduling (hours 0-23, in TIMEZONE) ---
export const HEARTBEAT_REPORT_HOUR = int(process.env.HEARTBEAT_REPORT_HOUR, 3);
export const DEV_STATUS_HOURS = hourList(process.env.DEV_STATUS_HOURS, [12, 18]);

// --- Retry policy ---
export const MAX_RETRY_ATTEMPTS = int(process.env.MAX_RETRY_ATTEMPTS, 30);
export const RETRY_DELAY_MS = int(process.env.RETRY_DELAY_MS, 3000);

// --- Devices ---
/** Path to the JSON device registry. Relative paths resolve from the process CWD. */
export const DEVICES_CONFIG_PATH =
	process.env.DEVICES_CONFIG_PATH || "devices.json";
