"""Authenticated workspace operations. No agent execution or stored credentials."""
from __future__ import annotations

import json
from typing import Literal

from fastapi import Header, HTTPException, Query
from pydantic import BaseModel, Field

from . import db as dbmod


class UserUpdate(BaseModel):
    role: Literal["viewer", "operator", "admin"]
    disabled: bool = False


class DeviceMetadata(BaseModel):
    group: str = Field(default="", max_length=60)
    tags: list[str] = Field(default_factory=list, max_length=10)


def install_workspace_routes(app, conn, require_role, audit):
    @app.patch("/api/auth/users/{username}")
    def update_user(username: str, body: UserUpdate, x_admin_token: str | None = Header(default=None),
                    x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        if actor == username and (body.disabled or body.role != "admin"):
            raise HTTPException(409, "You cannot disable or demote your own account.")
        with conn.transaction():
            # Serialize concurrent admin changes across PostgreSQL workers too.
            if conn.dialect == "postgres":
                conn.execute("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE")
            else:
                conn.execute("BEGIN IMMEDIATE")
            user = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
            if user is None:
                raise HTTPException(404, "User not found.")
            if user["role"] == "admin" and not user["disabled"] and (body.disabled or body.role != "admin"):
                count = conn.execute("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND disabled=0").fetchone()["n"]
                if count <= 1:
                    raise HTTPException(409, "Keep at least one active administrator.")
            conn.execute("UPDATE users SET role=?, disabled=? WHERE username=?", (body.role, int(body.disabled), username))
            conn.execute("DELETE FROM sessions WHERE username=?", (username,))
        audit(actor, "", "update_user", {"username": username, **body.model_dump()}, "allowed")
        return {"username": username, **body.model_dump(), "sessions_revoked": True}

    @app.put("/api/devices/{device_id}/metadata")
    def set_metadata(device_id: str, body: DeviceMetadata, x_admin_token: str | None = Header(default=None),
                     x_session_token: str | None = Header(default=None)):
        actor = require_role("admin", x_admin_token, x_session_token)
        device = conn.execute("SELECT tenant FROM devices WHERE id=?", (device_id,)).fetchone()
        if device is None:
            raise HTTPException(404, "Device not found.")
        tags = sorted({tag.strip() for tag in body.tags if tag.strip()})
        if any(len(tag) > 40 for tag in tags):
            raise HTTPException(422, "Tags must be 40 characters or fewer.")
        group = body.group.strip()
        with conn.transaction():
            conn.execute(
                "INSERT INTO device_metadata (device_id, group_name, tags_json) VALUES (?,?,?) "
                "ON CONFLICT (device_id) DO UPDATE SET group_name=excluded.group_name, tags_json=excluded.tags_json",
                (device_id, group, json.dumps(tags)),
            )
        audit(actor, device_id, "device_metadata", {"group": group, "tags": tags}, "allowed", tenant=device["tenant"])
        return {"group": group, "tags": tags}

    @app.get("/api/fleet/inventory")
    def inventory(q: str = Query(default="", max_length=200), status: str = "all", group: str = "",
                  tag: str = "", tenant: str = "default", page: int = Query(default=1, ge=1),
                  page_size: int = Query(default=25, ge=1, le=100),
                  x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("viewer", x_admin_token, x_session_token)
        clauses, params = ["d.tenant=?"], [tenant]
        if q.strip():
            clauses.append("(LOWER(d.name) LIKE ? OR LOWER(d.hostname) LIKE ? OR LOWER(d.id) LIKE ?)")
            params.extend(["%" + q.strip().lower() + "%"] * 3)
        if status != "all":
            if status not in ("online", "offline", "revoked", "unknown"):
                raise HTTPException(422, "Unknown device status.")
            clauses.append("d.revoked=1" if status == "revoked" else "d.revoked=0 AND d.status=?")
            if status != "revoked":
                params.append(status)
        if group:
            clauses.append("m.group_name=?")
            params.append(group)
        if tag:
            if conn.dialect == "postgres":
                clauses.append("EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(m.tags_json,'[]')::jsonb) AS tags(value) WHERE value=?)")
            else:
                clauses.append("EXISTS (SELECT 1 FROM json_each(COALESCE(m.tags_json,'[]')) WHERE value=?)")
            params.append(tag)
        source = " FROM devices d LEFT JOIN device_metadata m ON m.device_id=d.id WHERE " + " AND ".join(clauses)
        total = conn.execute("SELECT COUNT(*) AS n" + source, tuple(params)).fetchone()["n"]
        rows = conn.execute(
            "SELECT d.id, d.name, d.hostname, d.os, d.tenant, d.status, d.revoked, d.last_seen, "
            "d.token_expires_at, m.group_name, m.tags_json" + source +
            " ORDER BY LOWER(d.name), d.id LIMIT ? OFFSET ?",
            (*params, page_size, (page - 1) * page_size),
        ).fetchall()
        return {"items": [device_summary(row) for row in rows], "total": total, "page": page, "page_size": page_size}

    @app.get("/api/tasks/history")
    def task_history(q: str = Query(default="", max_length=200), status: str = "all",
                     device_id: str = "", tenant: str = "default", page: int = Query(default=1, ge=1),
                     page_size: int = Query(default=25, ge=1, le=100),
                     x_admin_token: str | None = Header(default=None), x_session_token: str | None = Header(default=None)):
        require_role("viewer", x_admin_token, x_session_token)
        clauses, params = ["tenant=?"], [tenant]
        if status != "all":
            clauses.append("status=?")
            params.append(status)
        if device_id:
            clauses.append("device_id=?")
            params.append(device_id)
        if q:
            clauses.append("(LOWER(tool) LIKE ? OR LOWER(id) LIKE ?)")
            params.extend(["%" + q.lower() + "%"] * 2)
        where = " WHERE " + " AND ".join(clauses)
        total = conn.execute("SELECT COUNT(*) AS n FROM tasks" + where, tuple(params)).fetchone()["n"]
        rows = conn.execute("SELECT * FROM tasks" + where + " ORDER BY created_at DESC, id LIMIT ? OFFSET ?",
                            (*params, page_size, (page - 1) * page_size)).fetchall()
        return {"items": [dict(row) for row in rows], "total": total, "page": page, "page_size": page_size}

    @app.get("/api/fleet/notifications")
    def notifications(tenant: str = "default", x_admin_token: str | None = Header(default=None),
                      x_session_token: str | None = Header(default=None)):
        require_role("viewer", x_admin_token, x_session_token)
        offline = conn.execute("SELECT COUNT(*) AS n FROM devices WHERE tenant=? AND revoked=0 AND "
                               "(status!='online' OR last_seen IS NULL OR last_seen<?)",
                               (tenant, dbmod.now() - 120)).fetchone()["n"]
        failed = conn.execute("SELECT COUNT(*) AS n FROM tasks WHERE tenant=? AND status='failed' AND created_at>?",
                              (tenant, dbmod.now() - 86400)).fetchone()["n"]
        pending = conn.execute("SELECT COUNT(*) AS n FROM approvals a JOIN tasks t ON t.id=a.task_id "
                               "WHERE t.tenant=? AND a.status='pending' AND (a.expires_at IS NULL OR a.expires_at>?)",
                               (tenant, dbmod.now())).fetchone()["n"]
        return {"offline_devices": offline, "failed_tasks_24h": failed, "pending_approvals": pending}


def device_summary(row):
    item = dict(row)
    item["group"] = item.pop("group_name", None) or ""
    item["tags"] = json.loads(item.pop("tags_json", None) or "[]")
    return item
