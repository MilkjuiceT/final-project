#!/usr/bin/env bash
#
# Tarpaulin API curl test script

set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"

PASS=0
FAIL=0

# check <description> <expected_status> <actual_status>
check() {
    local desc="$1"
    local expected="$2"
    local actual="$3"

    if [ "$expected" == "$actual" ]; then
        echo "PASS - $desc (expected $expected, got $actual)"
        PASS=$((PASS+1))
    else
        echo "FAIL - $desc (expected $expected, got $actual)"
        FAIL=$((FAIL+1))
    fi
}

# login <email> <password>  -> echoes the JWT
login() {
    curl -s -X POST "$BASE_URL/users/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
        | jq -r '.token'
}

echo "=================================================="
echo "Logging in as seeded users"
echo "=================================================="

ADMIN_TOKEN=$(login admin@tarpaulin.com adminpass123)
ALICE_INSTRUCTOR_TOKEN=$(login alice@tarpaulin.com alicepass123)
BOB_INSTRUCTOR_TOKEN=$(login bob@tarpaulin.com bobpass123)
STUDENT1_TOKEN=$(login student1@tarpaulin.com studentpass123)

echo "Admin token:        ${ADMIN_TOKEN:0:20}..."
echo "Alice Instructor token: ${ALICE_INSTRUCTOR_TOKEN:0:20}..."
echo "Bob Instructor token:   ${BOB_INSTRUCTOR_TOKEN:0:20}..."
echo "Student1 token:     ${STUDENT1_TOKEN:0:20}..."
echo

echo "=================================================="
echo "GET /users/:id authorization"
echo "=================================================="

# Student viewing their own record -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/users/4" \
    -H "Authorization: Bearer $STUDENT1_TOKEN")
check "Student1 views own user record" 200 "$STATUS"

# Student viewing someone else's record -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/users/5" \
    -H "Authorization: Bearer $STUDENT1_TOKEN")
check "Student1 views Student2's record (should be forbidden)" 403 "$STATUS"

# Admin viewing another user's record -> 200 
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/users/4" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
check "Admin views Student1's record" 200 "$STATUS"

# Alice Instructor viewing their own record -> 200, includes taught courses
RESPONSE=$(curl -s "$BASE_URL/users/2" -H "Authorization: Bearer $ALICE_INSTRUCTOR_TOKEN")
echo "Alice Instructor's user record: $RESPONSE"
echo

echo "=================================================="
echo "GET /courses (pagination + filters)"
echo "=================================================="

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/courses")
check "GET /courses (no auth required)" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/courses?term=sp26")
check "GET /courses?term=sp26" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/courses/1")
check "GET /courses/1" 200 "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/courses/1/assignments")
check "GET /courses/1/assignments" 200 "$STATUS"
echo

echo "=================================================="
echo "PATCH /courses/:id authorization"
echo "(course 1 is taught by Alice Instructor, not Bob Instructor)"
echo "=================================================="

# Alice Instructor (owns course 1) updates their own course -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/courses/1" \
    -H "Authorization: Bearer $ALICE_INSTRUCTOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Cloud Application Development"}')
check "Alice Instructor updates their own course (1)" 200 "$STATUS"

# Bob Instructor (does not own course 1) updates it -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/courses/1" \
    -H "Authorization: Bearer $BOB_INSTRUCTOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Hijacked Course"}')
check "Bob Instructor updates Alice Instructor's course (1) -- should be forbidden" 403 "$STATUS"

# Admin updates any course -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/courses/1" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"term":"sp26"}')
check "Admin updates course (1)" 200 "$STATUS"
echo

echo "=================================================="
echo "Course roster / enrollment authorization"
echo "(course 1 is taught by Alice Instructor, not Bob Instructor)"
echo "=================================================="

# Alice Instructor (owns course 1) lists students -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/courses/1/students" \
    -H "Authorization: Bearer $ALICE_INSTRUCTOR_TOKEN")
check "Alice Instructor lists students for their own course (1)" 200 "$STATUS"

# Bob Instructor (does not own course 1) lists students -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/courses/1/students" \
    -H "Authorization: Bearer $BOB_INSTRUCTOR_TOKEN")
check "Bob Instructor lists students for Alice Instructor's course (1) -- should be forbidden" 403 "$STATUS"

# Alice Instructor downloads the roster CSV -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/courses/1/roster" \
    -H "Authorization: Bearer $ALICE_INSTRUCTOR_TOKEN")
check "Alice Instructor downloads roster for their own course (1)" 200 "$STATUS"

# Bob Instructor downloads the roster CSV for course 1 -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/courses/1/roster" \
    -H "Authorization: Bearer $BOB_INSTRUCTOR_TOKEN")
check "Bob Instructor downloads roster for Alice Instructor's course (1) -- should be forbidden" 403 "$STATUS"

# Alice Instructor updates enrollment for their own course -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/courses/1/students" \
    -H "Authorization: Bearer $ALICE_INSTRUCTOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"add":[],"remove":[]}')
check "Alice Instructor updates enrollment for their own course (1)" 200 "$STATUS"
echo

echo "=================================================="
echo "Assignment CRUD authorization"
echo "(assignment 1 belongs to course 1, taught by Alice Instructor)"
echo "=================================================="

# Alice Instructor creates a new assignment in their own course -> 201
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/assignments" \
    -H "Authorization: Bearer $ALICE_INSTRUCTOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"courseId":1,"title":"Quiz - Auth Test","dueDate":"2026-06-30T23:59:00.000Z","points":10}')
NEW_ASSIGNMENT_ID=$(echo "$CREATE_RESPONSE" | jq -r '.id')
echo "Created assignment $NEW_ASSIGNMENT_ID"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/assignments" \
    -H "Authorization: Bearer $ALICE_INSTRUCTOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"courseId":1,"title":"Quiz - Auth Test 2","dueDate":"2026-06-30T23:59:00.000Z","points":10}')
check "Alice Instructor creates assignment in their own course (1)" 201 "$STATUS"

# Bob Instructor tries to create an assignment in Alice Instructor's course -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/assignments" \
    -H "Authorization: Bearer $BOB_INSTRUCTOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"courseId":1,"title":"Bob Instructor Sneaky Quiz","dueDate":"2026-06-30T23:59:00.000Z","points":10}')
check "Bob Instructor creates assignment in Alice Instructor's course (1) -- should be forbidden" 403 "$STATUS"

# Alice Instructor updates their own assignment -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/assignments/$NEW_ASSIGNMENT_ID" \
    -H "Authorization: Bearer $ALICE_INSTRUCTOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"points":20}')
check "Alice Instructor updates their own assignment ($NEW_ASSIGNMENT_ID)" 200 "$STATUS"

# Bob Instructor tries to update Alice Instructor's assignment -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/assignments/$NEW_ASSIGNMENT_ID" \
    -H "Authorization: Bearer $BOB_INSTRUCTOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"points":999}')
check "Bob Instructor updates Alice Instructor's assignment ($NEW_ASSIGNMENT_ID) -- should be forbidden" 403 "$STATUS"

# Bob Instructor tries to delete Alice Instructor's assignment -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/assignments/$NEW_ASSIGNMENT_ID" \
    -H "Authorization: Bearer $BOB_INSTRUCTOR_TOKEN")
check "Bob Instructor deletes Alice Instructor's assignment ($NEW_ASSIGNMENT_ID) -- should be forbidden" 403 "$STATUS"

# Admin can delete it regardless -> 204
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/assignments/$NEW_ASSIGNMENT_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
check "Admin deletes the assignment ($NEW_ASSIGNMENT_ID)" 204 "$STATUS"
echo

echo "=================================================="
echo "Submission upload + pagination + grading + media download"
echo "(assignment 1 belongs to course 1; Student1 is enrolled)"
echo "=================================================="

# Make a small file to upload
TMP_FILE=$(mktemp /tmp/submission-XXXX.txt)
echo "This is a test submission for assignment 1." > "$TMP_FILE"

UPLOAD_RESPONSE=$(curl -s -X POST "$BASE_URL/assignments/1/submissions" \
    -H "Authorization: Bearer $STUDENT1_TOKEN" \
    -F "file=@${TMP_FILE}")
SUBMISSION_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.id')
echo "Created submission $SUBMISSION_ID: $UPLOAD_RESPONSE"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/assignments/1/submissions" \
    -H "Authorization: Bearer $STUDENT1_TOKEN" \
    -F "file=@${TMP_FILE}")
check "Student1 uploads a submission for assignment 1" 201 "$STATUS"

rm -f "$TMP_FILE"

# Student1 lists their own submissions -> 200, should only see their own
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/assignments/1/submissions" \
    -H "Authorization: Bearer $STUDENT1_TOKEN")
check "Student1 lists submissions for assignment 1" 200 "$STATUS"

# Alice Instructor (instructor of course 1) lists all submissions -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/assignments/1/submissions" \
    -H "Authorization: Bearer $ALICE_INSTRUCTOR_TOKEN")
check "Alice Instructor (instructor) lists submissions for assignment 1" 200 "$STATUS"

# Bob Instructor (not instructor of course 1) lists submissions for student-only view
# (per current logic, non-owning instructors fall through to the
# "students only see their own" branch, so this should return only
# Bob Instructor's own submissions, i.e. none -- expect 200 with empty list)
RESPONSE=$(curl -s "$BASE_URL/assignments/1/submissions" \
    -H "Authorization: Bearer $BOB_INSTRUCTOR_TOKEN")
echo "Bob Instructor's view of assignment 1 submissions: $RESPONSE"

# Pagination check
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/assignments/1/submissions?cursor=0" \
    -H "Authorization: Bearer $ALICE_INSTRUCTOR_TOKEN")
check "GET /assignments/1/submissions?cursor=0" 200 "$STATUS"

# Get the filename for the uploaded submission so we can test the media endpoint
SUBMISSION_FILENAME=$(curl -s "$BASE_URL/assignments/1/submissions" \
    -H "Authorization: Bearer $ALICE_INSTRUCTOR_TOKEN" \
    | jq -r --arg id "$SUBMISSION_ID" '.submissions[] | select(.id == ($id | tonumber)) | .filename')
echo "Submission $SUBMISSION_ID filename: $SUBMISSION_FILENAME"
echo

echo "=================================================="
echo "PATCH /submissions/:id (grading) authorization"
echo "(submission $SUBMISSION_ID belongs to assignment 1, course 1, owned by Alice Instructor)"
echo "=================================================="

# Alice Instructor (instructor of course 1) grades Student1's submission -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/submissions/$SUBMISSION_ID" \
    -H "Authorization: Bearer $ALICE_INSTRUCTOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"grade":95}')
check "Alice Instructor grades Student1's submission ($SUBMISSION_ID)" 200 "$STATUS"

# Bob Instructor (not instructor of course 1) tries to grade it -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/submissions/$SUBMISSION_ID" \
    -H "Authorization: Bearer $BOB_INSTRUCTOR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"grade":0}')
check "Bob Instructor grades Student1's submission ($SUBMISSION_ID) -- should be forbidden" 403 "$STATUS"

# Student tries to grade their own submission -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/submissions/$SUBMISSION_ID" \
    -H "Authorization: Bearer $STUDENT1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"grade":100}')
check "Student1 grades their own submission ($SUBMISSION_ID) -- should be forbidden" 403 "$STATUS"

# Admin can grade it regardless -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/submissions/$SUBMISSION_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"grade":100}')
check "Admin grades Student1's submission ($SUBMISSION_ID)" 200 "$STATUS"
echo

echo "=================================================="
echo "GET /media/submissions/:filename authorization"
echo "=================================================="

if [ -n "$SUBMISSION_FILENAME" ] && [ "$SUBMISSION_FILENAME" != "null" ]; then
    # Student1 (owner of the submission) downloads their own file -> 200
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/media/submissions/$SUBMISSION_FILENAME" \
        -H "Authorization: Bearer $STUDENT1_TOKEN")
    check "Student1 downloads their own submission file" 200 "$STATUS"

    # Alice Instructor (instructor of course 1) downloads it -> 200
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/media/submissions/$SUBMISSION_FILENAME" \
        -H "Authorization: Bearer $ALICE_INSTRUCTOR_TOKEN")
    check "Alice Instructor downloads Student1's submission file" 200 "$STATUS"

    # Bob Instructor (not instructor of course 1) downloads it -> 403
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/media/submissions/$SUBMISSION_FILENAME" \
        -H "Authorization: Bearer $BOB_INSTRUCTOR_TOKEN")
    check "Bob Instructor downloads Student1's submission file -- should be forbidden" 403 "$STATUS"

    # Admin downloads it -> 200
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/media/submissions/$SUBMISSION_FILENAME" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    check "Admin downloads Student1's submission file" 200 "$STATUS"

    # No auth -> 401
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/media/submissions/$SUBMISSION_FILENAME")
    check "Unauthenticated request to download submission file -- should be unauthorized" 401 "$STATUS"

    # Nonexistent filename -> 404
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/media/submissions/does-not-exist.txt" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    check "Download nonexistent submission file -- should be not found" 404 "$STATUS"
else
    echo "SKIP - could not determine submission filename, skipping media endpoint tests"
fi
echo

echo "=================================================="
echo "Results: $PASS passed, $FAIL failed"
echo "=================================================="

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi