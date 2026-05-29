const fetch = require("node-fetch");

exports.main = async ({ parameters }) => {
  const { action, engagementId, portalId, recordId } = parameters;

  const token = process.env.HUBSPOT_SERVICE_KEY;
  if (!token) return { error: "HUBSPOT_SERVICE_KEY not configured" };

  // Action: get signed video URL
  if (action === "getVideoUrl" || !action) {
    if (!engagementId || !portalId) return { error: "Missing engagementId or portalId" };
    try {
      const res = await fetch(
        `https://api-eu1.hubspot.com/recording/auth/provider/hublets/v1/external-url-retriever/getAuthRecording/portal/${portalId}/engagement/${engagementId}`,
        { headers: { Authorization: `Bearer ${token}` }, redirect: "manual" }
      );
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (location) return { url: location };
      }
      const text = await res.text();
      if (text.trim().startsWith("http")) return { url: text.trim() };
      try { return JSON.parse(text); } catch { return { error: `HubSpot ${res.status}` }; }
    } catch (e) { return { error: e.message }; }
  }

  // Action: get associated contacts
  if (action === "getContacts") {
    if (!recordId) return { contacts: [] };
    try {
      // Get associated contact IDs
      const assocRes = await fetch(
        `https://api.hubapi.com/crm/v3/objects/p_recordings/${recordId}/associations/contacts`,
        { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
      );
      if (!assocRes.ok) return { contacts: [] };
      const assocData = await assocRes.json();
      const contactIds = (assocData.results || []).map((r) => r.id);
      if (!contactIds.length) return { contacts: [] };

      // Batch fetch contact names
      const batchRes = await fetch(
        `https://api.hubapi.com/crm/v3/objects/contacts/batch/read`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            inputs: contactIds.map((id) => ({ id })),
            properties: ["firstname", "lastname", "email", "jobtitle"],
          }),
        }
      );
      if (!batchRes.ok) return { contacts: [] };
      const batchData = await batchRes.json();
      const contacts = (batchData.results || []).map((c) => ({
        id: c.id,
        name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(" ") || c.properties.email || "Unknown",
        title: c.properties.jobtitle || "",
        email: c.properties.email || "",
      }));
      return { contacts };
    } catch (e) { return { contacts: [], error: e.message }; }
  }

  return { error: "Unknown action" };
};
