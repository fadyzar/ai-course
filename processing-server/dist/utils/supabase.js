"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminClient = getAdminClient;
exports.createUserClient = createUserClient;
const supabase_js_1 = require("@supabase/supabase-js");
let _adminClient = null;
function getAdminClient() {
    if (_adminClient)
        return _adminClient;
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }
    _adminClient = (0, supabase_js_1.createClient)(url, serviceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
    return _adminClient;
}
function createUserClient(accessToken) {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
        throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
    }
    return (0, supabase_js_1.createClient)(url, anonKey, {
        global: {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
