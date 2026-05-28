import React, { useEffect, useState } from "react";
import {
  hubspot,
  Text,
  LoadingSpinner,
  ErrorState,
  Flex,
  Link,
} from "@hubspot/ui-extensions";
// @ts-ignore — experimental export
import { Iframe } from "@hubspot/ui-extensions/experimental";
import type { CrmContext, ExtensionPointApiActions } from "@hubspot/ui-extensions";

interface CrmExtensionProps {
  context: CrmContext;
  actions: ExtensionPointApiActions<"crm.record.tab">;
  fetchCrmObjectProperties: (
    properties: string[]
  ) => Promise<Record<string, string>>;
}

hubspot.extend<"crm.record.tab">(
  ({ context, actions, fetchCrmObjectProperties }: CrmExtensionProps) => (
    <RecordingCard
      context={context}
      actions={actions}
      fetchCrmObjectProperties={fetchCrmObjectProperties}
    />
  )
);

const RecordingCard = ({ fetchCrmObjectProperties }: CrmExtensionProps) => {
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCrmObjectProperties(["recording_url"])
      .then((props) => {
        const url = props["recording_url"];
        if (url) {
          setRecordingUrl(url);
        } else {
          setError("No recording URL found on this record.");
        }
      })
      .catch(() => {
        setError("Failed to load recording properties.");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Flex direction="column" align="center" justify="center">
        <LoadingSpinner label="Loading recording…" />
      </Flex>
    );
  }

  if (error || !recordingUrl) {
    return (
      <ErrorState title="Recording unavailable">
        <Text>{error ?? "No recording URL on this record."}</Text>
      </ErrorState>
    );
  }

  return (
    <Flex direction="column" gap="small">
      <Iframe src={recordingUrl} height="lg" />
      <Link href={recordingUrl} target="blank">
        Open in full screen
      </Link>
    </Flex>
  );
};
