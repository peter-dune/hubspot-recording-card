const fetch = require("node-fetch");

exports.main = async ({ parameters }) => {
  const { engagementId, portalId } = parameters;

  if (!engagementId || !portalId) {
    return { error: "Missing engagementId or portalId" };
  }

  const token = process.env.HUBSPOT_SERVICE_KEY;
  if (!token) {
    return { error: "HUBSPOT_SERVICE_KEY secret not configured" };
  }

  const url = `https://api-eu1.hubspot.com/recording/auth/provider/hublets/v1/external-url-retriever/getAuthRecording/portal/${portalId}/engagement/${engagementId}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "manual",
    });

    // Expect a redirect to the signed MP4 URL
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location) return { url: location };
    }

    const text = await res.text();
    const trimmed = text.trim();
    if (trimmed.startsWith("http")) return { url: trimmed };

    try {
      const data = JSON.parse(text);
      return data;
    } catch {
      return { error: `HubSpot ${res.status}`, preview: trimmed.slice(0, 200) };
    }
  } catch (e) {
    return { error: e.message };
  }
};
