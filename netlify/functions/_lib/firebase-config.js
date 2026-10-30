// Firestore security rules and indexes. Deployed by the setup function (or copy firestore.rules into the console).
// Browsers can only READ, and only what their role allows. Every write goes through Netlify functions.
export const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null && request.auth.token.active == true; }
    function role() { return request.auth.token.role; }
    function national() { return signedIn() && role() in ['superadmin', 'admin']; }
    function coordinatorOf(s) { return signedIn() && role() == 'coordinator' && s != null && request.auth.token.stateCode == s; }
    function leads(h) { return signedIn() && h != null && request.auth.token.hubIds is list && h in request.auth.token.hubIds; }

    match /public/{doc} { allow read: if true; }
    match /settings/{doc} { allow read: if signedIn(); }
    match /states/{code} { allow read: if signedIn(); }
    match /meetings/{id} { allow read: if signedIn(); }
    match /announcements/{id} { allow read: if signedIn(); }

    match /hubs/{hubId} {
      allow read: if national() || coordinatorOf(resource.data.stateCode) || leads(hubId);
    }
    match /participants/{id} {
      allow read: if national() || coordinatorOf(resource.data.stateCode) || leads(resource.data.hubId);
    }
    match /hubMemberships/{id} {
      allow read: if national() || coordinatorOf(resource.data.stateCode) || leads(resource.data.hubId);
    }
    match /attendance/{id} {
      allow read: if national() || coordinatorOf(resource.data.stateCode) || leads(resource.data.hubId);
    }
    match /users/{uid} {
      allow read: if national() || (signedIn() && request.auth.uid == uid) || coordinatorOf(resource.data.stateCode);
    }
    match /volunteers/{id} {
      allow read: if national() || coordinatorOf(resource.data.stateCode);
    }
    match /activityLogs/{id} {
      allow read: if national() || coordinatorOf(resource.data.stateCode);
    }
    match /mail/{id} { allow read: if national(); }
    match /{document=**} { allow write: if false; }
  }
}
`;

const f = (fieldPath, order = "ASCENDING") => ({ fieldPath, order });

export const INDEXES = [
  { collectionGroup: "announcements", fields: [f("status"), f("sentAt", "DESCENDING")] },
  { collectionGroup: "announcements", fields: [f("status"), f("scheduledAt")] },
  { collectionGroup: "announcements", fields: [f("stateCode"), f("createdAt", "DESCENDING")] },
  { collectionGroup: "participants", fields: [f("stateCode"), f("createdAt", "DESCENDING")] },
  { collectionGroup: "participants", fields: [f("status"), f("createdAt", "DESCENDING")] },
  { collectionGroup: "participants", fields: [f("stateCode"), f("status"), f("createdAt", "DESCENDING")] },
  { collectionGroup: "participants", fields: [f("stateCode"), f("nameLower")] },
  { collectionGroup: "hubs", fields: [f("stateCode"), f("status")] },
  { collectionGroup: "attendance", fields: [f("hubId"), f("date")] },
  { collectionGroup: "attendance", fields: [f("stateCode"), f("date")] },
  { collectionGroup: "activityLogs", fields: [f("stateCode"), f("at", "DESCENDING")] },
  { collectionGroup: "activityLogs", fields: [f("participantId"), f("at", "DESCENDING")] },
  { collectionGroup: "hubMemberships", fields: [f("participantId"), f("startedAt", "DESCENDING")] },
];
