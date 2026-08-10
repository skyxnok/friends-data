/**
 * 友链可用性检查脚本
 * 逐个请求 friends.json 中的站点地址：
 *  - 能返回任何 HTTP 响应（含 403/404）=> 站点存活
 *  - 连接失败 / DNS 解析失败 / 超时 => 判定失效，标记 invalid: true
 * 恢复访问后自动移除 invalid 标记。
 *
 * 用法：node scripts/check-friends.js
 * 由 GitHub Actions 定时执行，结果自动提交回仓库。
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../friends.json", import.meta.url).pathname;
const TIMEOUT_MS = 15000;
const ATTEMPTS = 2;

/** 判断站点是否可访问（能收到任何 HTTP 响应即视为存活） */
async function isAccessible(url) {
	for (let i = 0; i < ATTEMPTS; i++) {
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
			try {
				const resp = await fetch(url, {
					method: "GET",
					redirect: "follow",
					signal: controller.signal,
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
					},
				});
				return true; // 收到响应即存活
			} finally {
				clearTimeout(timer);
			}
		} catch {
			// 连接失败/超时，稍等后重试
			await new Promise((r) => setTimeout(r, 3000));
		}
	}
	return false;
}

const friends = JSON.parse(readFileSync(FILE, "utf8"));

const results = [];
for (const f of friends) {
	if (!f.siteurl) continue;
	const ok = await isAccessible(f.siteurl);
	const wasInvalid = f.invalid === true;

	if (ok && wasInvalid) {
		delete f.invalid; // 恢复访问，移除失效标记
		results.push({ title: f.title, status: "恢复", url: f.siteurl });
	} else if (!ok && !wasInvalid) {
		f.invalid = true; // 打上失效标记
		results.push({ title: f.title, status: "失效", url: f.siteurl });
	} else {
		results.push({ title: f.title, status: ok ? "正常" : "失效(保持)", url: f.siteurl });
	}
}

writeFileSync(FILE, JSON.stringify(friends, null, 2) + "\n");

// 输出结果摘要
console.log("\n===== 友链可用性检查结果 =====");
for (const r of results) {
	console.log(`[${r.status}] ${r.title} - ${r.url}`);
}
const invalidCount = results.filter((r) => r.status.startsWith("失效")).length;
console.log(`\n共 ${results.length} 个友链，失效 ${invalidCount} 个`);
