export const SEMEN_REPORT_STYLES = `
*{box-sizing:border-box}body{margin:0;background:#eef2f5;color:#172431;font:14px/1.55 Arial,sans-serif}
.page{max-width:900px;margin:32px auto;background:white;box-shadow:0 12px 40px #18304a18}
header{padding:28px 36px;background:#102d3d;color:white;display:flex;justify-content:space-between;gap:24px;align-items:flex-start}
.brand{font-size:12px;letter-spacing:2px;font-weight:700;color:#79d2c0}h1{font-size:25px;line-height:1.2;margin:8px 0 4px}.meta{color:#c8d6df;font-size:12px}
.status{border:1px solid #79d2c0;color:#b8eee2;padding:6px 10px;border-radius:20px;white-space:nowrap;font-size:11px;font-weight:700}
main{padding:30px 36px}.notice{padding:13px 16px;border-inline-start:4px solid #c67a18;background:#fff7e8;color:#70430c;margin-bottom:24px}
.demo{padding:12px 16px;background:#eceff3;border:1px solid #c7d0d8;margin-bottom:20px;font-weight:700}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}section{margin:0 0 26px}h2{font-size:16px;margin:0 0 12px;color:#102d3d;border-bottom:2px solid #dce8e7;padding-bottom:7px}
table{border-collapse:collapse;width:100%}th,td{text-align:start;padding:9px 8px;border-bottom:1px solid #e7ecef;vertical-align:top}th{font-weight:500;color:#5c6c77;width:54%}td{font-weight:700;color:#172431}
.finding{padding:18px;border:1px solid #b9d9d3;background:#f1faf7;margin-bottom:24px}.finding strong{display:block;font-size:17px;margin-bottom:6px}
figure{margin:0 0 24px;text-align:center}figure img{max-width:100%;max-height:420px;border:1px solid #d4dde2}figcaption{font-size:11px;color:#657681;margin-top:7px}
ul{margin:0;padding-inline-start:20px}.checksum{font:10px/1.5 monospace;overflow-wrap:anywhere;color:#647580}.next{background:#edf5f8;padding:16px;border-radius:6px}
footer{padding:18px 36px;border-top:1px solid #dce4e8;color:#687984;font-size:11px;display:flex;justify-content:space-between;gap:20px}
@page{size:A4;margin:12mm}@media print{body{background:white}.page{margin:0;max-width:none;box-shadow:none}header{print-color-adjust:exact;-webkit-print-color-adjust:exact}section,figure,.finding{break-inside:avoid}main{padding:24px 0}header{padding:22px 0}footer{padding:16px 0}}
@media(max-width:640px){.page{margin:0}.grid{grid-template-columns:1fr}header,main,footer{padding:20px}header{display:block}.status{display:inline-block;margin-top:12px}}
`;
