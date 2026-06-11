async function main() {
  const email = process.env.SUB2API_ADMIN_EMAIL;
  const password = process.env.SUB2API_ADMIN_PASSWORD;

  const loginResp = await fetch("http://sub2api:18080/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginText = await loginResp.text();
  let loginJson = {};
  try {
    loginJson = loginText ? JSON.parse(loginText) : {};
  } catch {}

  const token = (loginJson.data && loginJson.data.access_token) || loginJson.access_token || "";
  if (!token) {
    console.error("LOGIN_FAILED", loginResp.status, loginText);
    process.exit(1);
  }

  const cases = [
    { tradeStatus: "paid", fulfillmentStatus: "fulfilled", page: "1", pageSize: "5" },
    { tradeStatus: "pending", fulfillmentStatus: "pending", page: "1", pageSize: "5" },
    { tradeStatus: "closed", fulfillmentStatus: "pending", page: "1", pageSize: "5" },
    { tradeStatus: "paid", fulfillmentStatus: "pending", page: "1", pageSize: "5" },
  ];

  for (const params of cases) {
    const qs = new URLSearchParams(params);
    const resp = await fetch(`http://127.0.0.1:3000/pay-api/admin/orders?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await resp.text();
    console.log("CASE", qs.toString());
    console.log(text);
  }
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
