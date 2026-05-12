export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const orderData = req.body || {};
        const { apiKey } = req.query;

        if (!apiKey) {
            return res.status(400).json({ error: 'الكود السري مفقود من الرابط' });
        }

        const firebaseWebApiKey = "AIzaSyBuGdQQZ2lDu73W7wP3na45rlhiMXjaqGw";
        const projectId = "axon-express-2f534";

        // 1. تسجيل الدخول
        const authResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseWebApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: "api@axon.com", password: "AxonApi2026!", returnSecureToken: true })
        });

        const authData = await authResponse.json();
        if (authData.error) {
            return res.status(401).json({ error: `خطأ في تسجيل دخول الموظف: ${authData.error.message}` });
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authData.idToken}`
        };

        // 2. البحث عن التاجر
        const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
        const queryResponse = await fetch(queryUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId: "merchant_profiles" }],
                    where: { fieldFilter: { field: { fieldPath: "apiKey" }, op: "EQUAL", value: { stringValue: apiKey } } },
                    limit: 1
                }
            })
        });

        const queryResult = await queryResponse.json();

        // هنا السحر: لو الفايربيز رافض عشان الحماية، هيقولنا صراحة
        if (queryResult.error) {
            return res.status(403).json({ error: `قواعد حماية الفايربيز (Rules) منعت البحث: ${queryResult.error.message}` });
        }

        if (!Array.isArray(queryResult) || !queryResult[0] || !queryResult[0].document) {
            return res.status(404).json({ error: `لم يتم العثور على التاجر. رد الفايربيز: ${JSON.stringify(queryResult)}` });
        }

        // 3. سحب بيانات التاجر وتجهيز البوليصة
        const merchantDoc = queryResult[0].document;
        const merchantEmail = merchantDoc.name.split('/').pop(); 
        const merchantAddress = merchantDoc.fields.businessAddress?.stringValue || "غير مسجل";
        const merchantPhone = merchantDoc.fields.businessPhone?.stringValue || "غير مسجل";
        const branchName = merchantDoc.fields.branchName?.stringValue || "المركز الرئيسي";

        const customer = orderData.customer || {};
        const shipping = orderData.shipping_address || {};
        const recName = shipping.name || (customer.first_name + ' ' + customer.last_name) || "عميل شوبيفاي";
        const recPhone = shipping.phone || customer.phone || "لا يوجد";
        const recCity = shipping.city || shipping.province || "غير محدد";
        const recAddress = (shipping.address1 || "") + " " + (shipping.address2 || "");
        const amount = Math.round(parseFloat(orderData.current_total_price || 0));
        
        const awb = "AXN" + Math.random().toString(36).substring(2,7).toUpperCase();

        // 4. إضافة البوليصة في الفايربيز
        const addUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/shipments`;
        const shipmentPayload = {
            fields: {
                merchantEmail: { stringValue: merchantEmail },
                name: { stringValue: recName },
                phone: { stringValue: recPhone },
                phone2: { stringValue: "لا يوجد" },
                city: { stringValue: recCity },
                address: { stringValue: recAddress },
                weight: { integerValue: "1" },
                pieces: { stringValue: "1" },
                amount: { integerValue: amount.toString() },
                insuranceFee: { integerValue: "0" },
                paymentType: { stringValue: "normal" },
                fragile: { stringValue: "normal" },
                merchantAddress: { stringValue: merchantAddress },
                merchantPhone: { stringValue: merchantPhone },
                merchantIP: { stringValue: "Shopify Auto-Sync" },
                deviceInfo: { stringValue: "Shopify Integration API" },
                status: { stringValue: "قيد التوصيل" },
                deleted: { booleanValue: false },
                branchName: { stringValue: branchName },
                awb: { stringValue: awb },
                shippingCost: { integerValue: "85" },
                timestamp: { timestampValue: new Date().toISOString() }
            }
        };

        const addResponse = await fetch(addUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(shipmentPayload)
        });

        const addResult = await addResponse.json();
        
        if (addResult.error) {
            return res.status(403).json({ error: `قواعد حماية الفايربيز منعت تسجيل الشحنة: ${addResult.error.message}` });
        }

        return res.status(200).json({ success: true, awb: awb });

    } catch (error) {
        return res.status(500).json({ error: `خطأ برمجي داخلي: ${error.message}` });
    }
}
