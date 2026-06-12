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
INSTRUCTOR1_TOKEN=$(login alice@tarpaulin.com alicepass123)
INSTRUCTOR2_TOKEN=$(login bob@tarpaulin.com bobpass123)
STUDENT1_TOKEN=$(login student1@tarpaulin.com studentpass123)

echo "Admin token:        ${ADMIN_TOKEN:0:20}..."
echo "Instructor1 token:  ${INSTRUCTOR1_TOKEN:0:20}..."
echo "Instructor2 token:  ${INSTRUCTOR2_TOKEN:0:20}..."
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

# Instructor1 viewing their own record -> 200, includes taught courses
RESPONSE=$(curl -s "$BASE_URL/users/2" -H "Authorization: Bearer $INSTRUCTOR1_TOKEN")
echo "Instructor1's user record: $RESPONSE"
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
echo "Course roster / enrollment authorization"
echo "(course 1 is taught by Instructor1, not Instructor2)"
echo "=================================================="

# Instructor1 (owns course 1) lists students -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/courses/1/students" \
    -H "Authorization: Bearer $INSTRUCTOR1_TOKEN")
check "Instructor1 lists students for their own course (1)" 200 "$STATUS"

# Instructor2 (does not own course 1) lists students -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/courses/1/students" \
    -H "Authorization: Bearer $INSTRUCTOR2_TOKEN")
check "Instructor2 lists students for Instructor1's course (1) -- should be forbidden" 403 "$STATUS"

# Instructor1 downloads the roster CSV -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/courses/1/roster" \
    -H "Authorization: Bearer $INSTRUCTOR1_TOKEN")
check "Instructor1 downloads roster for their own course (1)" 200 "$STATUS"

# Instructor2 downloads the roster CSV for course 1 -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/courses/1/roster" \
    -H "Authorization: Bearer $INSTRUCTOR2_TOKEN")
check "Instructor2 downloads roster for Instructor1's course (1) -- should be forbidden" 403 "$STATUS"

# Instructor1 updates enrollment for their own course -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/courses/1/students" \
    -H "Authorization: Bearer $INSTRUCTOR1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"add":[],"remove":[]}')
check "Instructor1 updates enrollment for their own course (1)" 200 "$STATUS"
echo

echo "=================================================="
echo "Assignment CRUD authorization"
echo "(assignment 1 belongs to course 1, taught by Instructor1)"
echo "=================================================="

# Instructor1 creates a new assignment in their own course -> 201
CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/assignments" \
    -H "Authorization: Bearer $INSTRUCTOR1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"courseId":1,"title":"Quiz - Auth Test","dueDate":"2026-06-30T23:59:00.000Z","points":10}')
NEW_ASSIGNMENT_ID=$(echo "$CREATE_RESPONSE" | jq -r '.id')
echo "Created assignment $NEW_ASSIGNMENT_ID"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/assignments" \
    -H "Authorization: Bearer $INSTRUCTOR1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"courseId":1,"title":"Quiz - Auth Test 2","dueDate":"2026-06-30T23:59:00.000Z","points":10}')
check "Instructor1 creates assignment in their own course (1)" 201 "$STATUS"

# Instructor2 tries to create an assignment in Instructor1's course -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/assignments" \
    -H "Authorization: Bearer $INSTRUCTOR2_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"courseId":1,"title":"Instructor2 Sneaky Quiz","dueDate":"2026-06-30T23:59:00.000Z","points":10}')
check "Instructor2 creates assignment in Instructor1's course (1) -- should be forbidden" 403 "$STATUS"

# Instructor1 updates their own assignment -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/assignments/$NEW_ASSIGNMENT_ID" \
    -H "Authorization: Bearer $INSTRUCTOR1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"points":20}')
check "Instructor1 updates their own assignment ($NEW_ASSIGNMENT_ID)" 200 "$STATUS"

# Instructor2 tries to update Instructor1's assignment -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/assignments/$NEW_ASSIGNMENT_ID" \
    -H "Authorization: Bearer $INSTRUCTOR2_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"points":999}')
check "Instructor2 updates Instructor1's assignment ($NEW_ASSIGNMENT_ID) -- should be forbidden" 403 "$STATUS"

# Instructor2 tries to delete Instructor1's assignment -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/assignments/$NEW_ASSIGNMENT_ID" \
    -H "Authorization: Bearer $INSTRUCTOR2_TOKEN")
check "Instructor2 deletes Instructor1's assignment ($NEW_ASSIGNMENT_ID) -- should be forbidden" 403 "$STATUS"

# Admin can delete it regardless -> 204
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE_URL/assignments/$NEW_ASSIGNMENT_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
check "Admin deletes the assignment ($NEW_ASSIGNMENT_ID)" 204 "$STATUS"
echo

echo "=================================================="
echo "Submission upload + pagination + grading"
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

# Instructor1 instructor of course 1 lists all submissions -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/assignments/1/submissions" \
    -H "Authorization: Bearer $INSTRUCTOR1_TOKEN")
check "Instructor1 (instructor) lists submissions for assignment 1" 200 "$STATUS"

# Instructor2, not instructor of course 1, lists submissions for student only view
RESPONSE=$(curl -s "$BASE_URL/assignments/1/submissions" \
    -H "Authorization: Bearer $INSTRUCTOR2_TOKEN")
echo "Instructor2's view of assignment 1 submissions: $RESPONSE"

# Pagination check
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/assignments/1/submissions?cursor=0" \
    -H "Authorization: Bearer $INSTRUCTOR1_TOKEN")
check "GET /assignments/1/submissions?cursor=0" 200 "$STATUS"

# Instructor1 (instructor of course 1) grades Student1's submission -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/assignments/1/submissions/$SUBMISSION_ID" \
    -H "Authorization: Bearer $INSTRUCTOR1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"grade":95}')
check "Instructor1 grades Student1's submission ($SUBMISSION_ID)" 200 "$STATUS"

# Instructor2 (not instructor of course 1) tries to grade it -> 403
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/assignments/1/submissions/$SUBMISSION_ID" \
    -H "Authorization: Bearer $INSTRUCTOR2_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"grade":0}')
check "Instructor2 grades Student1's submission ($SUBMISSION_ID) -- should be forbidden" 403 "$STATUS"

# Admin can grade it regardless -> 200
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$BASE_URL/assignments/1/submissions/$SUBMISSION_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"grade":100}')
check "Admin grades Student1's submission ($SUBMISSION_ID)" 200 "$STATUS"


echo

echo "=================================================="
echo "Results: $PASS passed, $FAIL failed"
echo "=================================================="

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi