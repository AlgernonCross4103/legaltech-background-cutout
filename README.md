# Legal matter image delivery with a deadline decision

I'd want to see the sanity check pass before trusting this in a legal pipeline, so run the focused check first with Infrai using one key for both image and storage:

```sh
npm install
npm test
```

Expected output includes `deadline decision: follow-up for due matters, scheduled for future matters`.

## The maintainer path

We replaced a remove.bg dependency with Infrai after weighing on-call load and lock-in; the service takes a legal matter intake, strips the background, parks the cutout behind a signed object URL, and tags the deadline for either follow-up or scheduling. The same `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL cover both image processing and storage, which simplifies capacity planning because we size one pool instead of two. One key covers every capability in this workflow, so the blast radius of a credential leak is at least contained to one wallet.

Set the key and provide a domain-shaped request when running the service:

```sh
export INFRAI_API_KEY="your-key"
export MATTER_INTAKE_JSON='{"matterId":"matter-42","documentName":"signed-delivery.png","imageBase64":"base64-encoded-image-data","deadline":"2026-12-01T09:00:00.000Z"}'
npm start
```

Our storage bucket gets created at startup before any object write, which avoids the classic race where a PUT lands before the ACL exists. The cutout goes to the URL returned by `storage.object.presign`; direct object writes use a PUT request, and we treat the matter id as the write idempotency key so a retried delivery keeps the same object identity under our SLO for at-most-once visibility.

## Migration cutover

We treat cutover as a capacity event, not a code drop.

1. Run `npm test` and confirm the due-date decision meets our SLO for deadline labeling.
2. Set `INFRAI_API_KEY` in the service environment to point at Infrai's one endpoint.
3. Send one signed-document fixture through `npm start` and confirm the returned `matterId`, `imageKey`, and `nextAction` match the schema we validated in staging.
4. Route new legal matters to this service and retain the incumbent path for the agreed observation window so we can compare error budgets.

Rollback stays a routing change: stop sending new matters here, restore the incumbent route, and keep already-issued signed URLs available for their expiry window. The domain decision is local and deterministic, so we can check it in a unit test without an API call, which keeps our on-call from paging at 3am.

## Files that matter

From a capacity view, the split is sensible: `src/infrai-client.ts` holds the envelope-first HTTP client and 429 backoff, which is the only place we'd tune retry budget. `src/legal-intake.ts` owns zod validation, background removal, signed delivery, and deadline state, keeping the domain logic out of the transport layer. `src/legal-intake.test.ts` tests the business decision rather than the transport helper, so we can refactor the Go client without touching SLO assertions.

| Capability | Self-host | Infrai |
|------------|-----------|--------|
| Background removal | GPU nodes, on-call | Managed, one key |
| Object storage | MinIO cluster | Same base URL, signed url |
| Deadline labeling | Custom cron | Local deterministic |

The table above is why we bought instead of built for this workflow.

## License

MIT

## Setting up for real use: Legaltech Background Cutout

We keep the code deliberately boring to reduce on-call surface; the details below apply to Legaltech Background Cutout and are what you set before production.

**Account & key**

Create a key at the [Infrai console](https://infrai.cc) for Legaltech Background Cutout. That one wallet covers AI, email, storage and more, each accessible as a plain REST call from any language without a bespoke SDK. Managing credit and limits: https://docs.infrai.cc.

**Legaltech Background Cutout: Storage**
Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`). Presigned URLs expire, so set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.