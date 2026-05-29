import React, { useEffect, useState } from "react";
import {
  hubspot,
  useExtensionApi,
  Text,
  LoadingSpinner,
  ErrorState,
  Flex,
  Button,
  Tag,
  Divider,
  Heading,
} from "@hubspot/ui-extensions";

const PLAYER_BASE =
  "https://hubspot-recording-card-git-main-peter-6714s-projects.vercel.app";

hubspot.extend(() => <RecordingCard />);

function extractEngagementId(url: string): string | null {
  const match = url.match(/\/engagement\/(\d+)/);
  return match ? match[1] : null;
}

function formatDate(raw: string): string {
  if (!raw) return "";
  try {
    // HubSpot returns datetime as ms timestamp or ISO string
    const ts = Number(raw);
    const d = isNaN(ts) ? new Date(raw) : new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

interface Contact {
  id: string;
  name: string;
  title: string;
}

const RecordingCard = () => {
  const { actions, context, runServerlessFunction } = useExtensionApi<"crm.record.tab">();
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [title, setTitle] = useState<string>("");
  const [host, setHost] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const recordId = context.crm.objectId;

    // Fetch properties + associations in parallel
    Promise.all([
      actions.fetchCrmObjectProperties(["recording_url", "call_title", "call_name", "host", "call_date"]),
      recordId
        ? runServerlessFunction({
            name: "hubspot_recording_card_app_function",
            parameters: { action: "getContacts", recordId: String(recordId) },
          })
        : Promise.resolve(null),
    ])
      .then(([props, contactsResult]) => {
        const recordingUrl = props["recording_url"];
        if (!recordingUrl) { setError("No recording URL on this record."); return; }
        const engagementId = extractEngagementId(recordingUrl);
        if (!engagementId) { setError("Could not parse engagement ID."); return; }

        setTitle(props["call_title"] || props["call_name"] || "");
        setHost(props["host"] || "");
        setDate(formatDate(props["call_date"] || ""));

        if (contactsResult?.status === "SUCCESS" && contactsResult.response?.contacts) {
          setContacts(contactsResult.response.contacts);
        }

        const params = new URLSearchParams({ engagementId });
        if (recordId) params.set("recordId", String(recordId));
        setPlayerUrl(`${PLAYER_BASE}?${params.toString()}`);
      })
      .catch(() => setError("Failed to load recording."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Flex direction="column" align="center" justify="center">
        <LoadingSpinner label="Loading…" />
      </Flex>
    );
  }

  if (error || !playerUrl) {
    return (
      <ErrorState title="Recording unavailable">
        <Text>{error ?? "No recording found."}</Text>
      </ErrorState>
    );
  }

  return (
    <Flex direction="column" gap="small">

      {/* Title */}
      {title && <Heading level={4}>{title}</Heading>}

      {/* Meta tags */}
      <Flex direction="row" gap="extra-small" wrap="wrap">
        {date && <Tag variant="info">{date}</Tag>}
        {host && <Tag>🎙 {host}</Tag>}
      </Flex>

      {/* Participants */}
      {contacts.length > 0 && (
        <>
          <Divider />
          <Text format={{ fontWeight: "bold" }} variant="microcopy">PARTICIPANTS</Text>
          <Flex direction="row" gap="extra-small" wrap="wrap">
            {contacts.map((c) => (
              <Tag key={c.id} variant="success">
                {c.name}{c.title ? ` · ${c.title}` : ""}
              </Tag>
            ))}
          </Flex>
        </>
      )}

      <Divider />

      {/* Play button — not full width */}
      <Flex direction="row">
        <Button
          variant="primary"
          size="md"
          onClick={() =>
            actions.openIframeModal({
              uri: playerUrl,
              height: 600,
              width: 1100,
              title: title || "Call Recording",
            })
          }
        >
          ▶  Play Recording
        </Button>
      </Flex>

    </Flex>
  );
};
