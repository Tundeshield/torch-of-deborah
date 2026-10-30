// Firestore security rules and indexes, applied automatically the first time an admin signs in
// (see _lib/setup.js). Browsers can only read, and only what their role allows; all writes go through functions.
export const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null && request.auth.token.role != null; }
    function admin() { return signedIn() && request.auth.token.role == 'admin'; }
    function coordinatorOf(s) { return signedIn() && request.auth.token.role == 'coordinator' && request.auth.token.stateCode == s; }
    function leads(h) { return signedIn() && h != null && request.auth.token.hubIds is list && h in request.auth.token.hubIds; }

    match /settings/{doc} { allow read: if signedIn(); }
    match /states/{code} { allow read: if signedIn(); }
    match /hubs/{hubId} { allow read: if admin() || coordinatorOf(resource.data.stateCode) || leads(hubId); }
    match /participants/{id} { allow read: if admin() || coordinatorOf(resource.data.stateCode) || leads(resource.data.hubId); }
    match /users/{email} { allow read: if admin() || coordinatorOf(resource.data.stateCode) || (signedIn() && request.auth.token.email == email); }
    match /{document=**} { allow write: if false; }
  }
}
`;

const f = (fieldPath, order = "ASCENDING") => ({ fieldPath, order });

export const INDEXES = [
  { collectionGroup: "participants", fields: [f("stateCode"), f("createdAt", "DESCENDING")] },
  { collectionGroup: "participants", fields: [f("status"), f("createdAt", "DESCENDING")] },
  { collectionGroup: "participants", fields: [f("stateCode"), f("status"), f("createdAt", "DESCENDING")] },
  { collectionGroup: "participants", fields: [f("stateCode"), f("nameLower")] },
];
