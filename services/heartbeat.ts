import { TIMEZONE, HEARTBEAT_REPORT_HOUR } from "./config";

const timeZone = TIMEZONE;

// Maps deviceKey → Set of hours (0–23 local time) that sent a heartbeat today
const heartbeatStore = new Map<string, Set<number>>();

export type HeartbeatReport = {
	deviceKey: string;
	received: number;
	total: number;
	failedHours: number[];
};

export function recordHeartbeat(deviceKey: string): void {
	const mytime = new Date().toLocaleString("en-US", {
		timeZone,
		hour: "numeric",
		hour12: false,
	});
	const hour = parseInt(mytime, 10) % 24;

	if (!heartbeatStore.has(deviceKey)) {
		heartbeatStore.set(deviceKey, new Set());
	}
	heartbeatStore.get(deviceKey)!.add(hour);
}

export function getReport(deviceKey: string): HeartbeatReport {
	const hours = heartbeatStore.get(deviceKey) ?? new Set<number>();
	const failedHours = Array.from(
		{ length: 24 },
		(_, i) => (i + HEARTBEAT_REPORT_HOUR) % 24
	).filter((h) => !hours.has(h));
	return {
		deviceKey,
		received: hours.size,
		total: 24,
		failedHours,
	};
}

export function resetHeartbeats(): void {
	heartbeatStore.clear();
}
