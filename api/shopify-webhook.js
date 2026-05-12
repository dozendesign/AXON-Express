export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const orderData = req.body;
        const { apiKey } = req.query;

        if (!apiKey) {
            return res.status(401).json({ error: 'الكود السري (API Key) مفقود من الرابط' });
        }

        // بيانات الربط مع فايربيز
        const firebaseWebApiKey = "AIzaSyBuGdQQZ2lDu73W7wP3na45rlhiMXjaqGw";
        const projectId = "axon-express-2f534";

        // 1. تسجيل دخول "الموظف الآلي" عشان نعدي من قواعد الأمان (Rules) من غير ما نغيرها
        const authResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseWebApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: "api@axon.com",
                password: "AxonApi2026!",
                returnSecureToken: true
            })
        });

        const authData = await authResponse.json();
        
        if (!authData.idToken) {
            return res.status(500).json({ error: 'فشل تصريح المرور من الفايربيز', details: authData });
        }

        const idToken = authData.idToken;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}` // ده تصريح المرور السحري
        };

        // 2. البحث عن التاجر باستخدام الكود السري
        const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
        const queryResponse = await fetch(queryUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId: "merchant_profiles" }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath: "apiKey" },
                            op: "EQUAL",
                            value: { stringValue: apiKey }
                        }
                    },
                    limit: 1
                }
            })
        });

        const queryResult = await queryResponse.json();
        
        if (!queryResult || !queryResult[0] || !queryResult[0].document) {
            return res.status(403).json({ error: 'الكود السري غير صحيح أو غير متصل بحساب تاجر' });
        }

        // 3. سحب بيانات التاجر
        const merchantDoc = queryResult[0].document;
        const merchantEmail = merchantDoc.name.split('/').pop(); 
        const merchantAddress = merchantDoc.fields.businessAddress?.stringValue || "غير مسجل";
        const merchantPhone = merchantDoc.fields.businessPhone?.stringValue || "غير مسجل";
        const branchName = merchantDoc.fields.branchName?.stringValue || "المركز الرئيسي";

        // 4. تجهيز بيانات الأوردر اللي جيالنا من شوبيفاي
        const customer = orderData.customer || {};
        const shipping = orderData.shipping_address || {};
        
        const recName = shipping.name || (customer.first_name + ' ' + customer.last_name) || "عميل شوبيفاي";
        const recPhone = shipping.phone || customer.phone || "لا يوجد";
        const recCity = shipping.city || shipping.province || "غير محدد";
        const recAddress = (shipping.address1 || "") + " " + (shipping.address2 || "");
        const amount = Math.round(parseFloat(orderData.current_total_price || 0));
        
        const awb = "AXN" + Math.random().toString(36).substring(2,7).toUpperCase();

        // 5. رمي الشحنة في الداتا بيز بصفة رسمية
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

        if (!addResponse.ok) {
            throw new Error("فشل حفظ بوليصة الشحن");
        }

        // 6. تأكيد النجاح لشوبيفاي
        return res.status(200).json({ success: true, message: "تم سحب الأوردر بنجاح إلى Axon Express", awb: awb });

    } catch (error) {
        console.error("Axon Webhook Error:", error);
        return res.status(500).json({ error: 'حدث خطأ داخلي في الخادم', details: error.message });
    }
}
