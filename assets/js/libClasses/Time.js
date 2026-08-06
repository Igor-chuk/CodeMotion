export class _Time {
	static now() {
		return Math.floor(Date.now() / 1000);
	}

	static format(format, time = new Date()) {
		const date = time instanceof Date ? time : new Date(time * 1000);

		const values = {
			yyyy: date.getFullYear(),
			yy: String(date.getFullYear()).slice(-2),

			MM: String(date.getMonth() + 1).padStart(2, "0"),
			M: date.getMonth() + 1,

			dd: String(date.getDate()).padStart(2, "0"),
			d: date.getDate(),

			HH: String(date.getHours()).padStart(2, "0"),
			H: date.getHours(),

			mm: String(date.getMinutes()).padStart(2, "0"),
			m: date.getMinutes(),

			ss: String(date.getSeconds()).padStart(2, "0"),
			s: date.getSeconds(),

			unix: Math.floor(date.getTime() / 1000),
			ms: date.getTime(),
		};

		return format.replace(/\{\{(\w+)\}\}/g, (_, key) => {
			return values[key] ?? `{{${key}}}`;
		});
	}
}
