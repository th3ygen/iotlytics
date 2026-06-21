import fs from "fs";
import path from "path";

import { DEVICES_CONFIG_PATH } from "./config";

export type Device = {
	id: string;
	name: string;
	area: string;
	lon: number;
	lat: number;
	status: "pending" | "online";
	channelId: string;
};

export type DeviceRecord = Record<string, Device>;

function loadDevices(): DeviceRecord {
	const resolved = path.isAbsolute(DEVICES_CONFIG_PATH)
		? DEVICES_CONFIG_PATH
		: path.resolve(process.cwd(), DEVICES_CONFIG_PATH);

	try {
		const raw = fs.readFileSync(resolved, "utf-8");
		return JSON.parse(raw) as DeviceRecord;
	} catch (e) {
		console.error(
			new Date(Date.now()).toLocaleString(),
			`Failed to load device registry from ${resolved}:`,
			e
		);
		return {};
	}
}

export let devices: DeviceRecord = loadDevices();

export function updateDevice(id: string, payload: Device) {
	devices[id] = {
		...payload,
	};

	return devices;
}
