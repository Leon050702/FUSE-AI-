// VAF grid template generator — populates #vaf-grid-container with 14 GSC rows.
document.addEventListener('DOMContentLoaded', () => {
                const vafItems = [
                    "Data Communications", "Distributed Data Processing", "Performance",
                    "Heavily Used Configuration", "Transaction Rate", "On-line Data Entry",
                    "End-User Efficiency", "On-Line Update", "Complex Processing",
                    "Reusability", "Installation Ease", "Operational Ease",
                    "Multiple Sites", "Facilitate Change"
                ];

                let leftColHtml = `<div style="display: flex; flex-direction: column;">
                    <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 10px;">
                        <span style="font-weight: 600; color: #64748b; font-size: 13px;">GSC</span>
                        <span style="font-weight: 600; color: #64748b; font-size: 13px; margin-right: 50px;">(0 - 5)</span>
                    </div>`;

                let rightColHtml = `<div style="display: flex; flex-direction: column;">
                    <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; margin-bottom: 10px;">
                        <span style="font-weight: 600; color: #64748b; font-size: 13px;">GSC</span>
                        <span style="font-weight: 600; color: #64748b; font-size: 13px; margin-right: 50px;">(0 - 5)</span>
                    </div>`;

                vafItems.forEach((item, index) => {
                    const i = index + 1;
                    const options = [0, 1, 2, 3, 4, 5].map(v => `<option value="${v}">${v}</option>`).join('');
                    const rowHtml = `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px dashed #e2e8f0;">
                            <span style="color: #64748b; font-size: 13px;">${item}</span>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <select id="komponen-vaf-${i}" class="form-control" style="width: 100px; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 13px; text-align: center; color: #333; background: white; appearance: auto; margin:0;" onchange="calculateVAF()">
                                    ${options}
                                </select>
                                <span style="color: #94a3b8; cursor: pointer; font-size: 14px; display: inline-block; width: 20px; text-align: center;" title="Maklumat Lanjut tentang ${item}">&#9432;</span>
                            </div>
                        </div>
                    `;

                    if (i <= 7) leftColHtml += rowHtml;
                    else rightColHtml += rowHtml;
                });

                leftColHtml += `</div>`;
                rightColHtml += `</div>`;

                document.getElementById('vaf-grid-container').innerHTML = leftColHtml + rightColHtml;
});

