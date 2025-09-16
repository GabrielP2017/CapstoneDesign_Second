import React, { useState } from 'react';

const WizardStep = ({ step, formData, handleChange, handlePriceChange, setQuickPrice, currentCurrencySymbol, itemTypes, countries }) => {
    switch (step) {
        case 1:
            return (
                <div className="space-y-4">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">물품 종류를 선택하세요:</label>
                    <select name="itemType" value={formData.itemType} onChange={handleChange} className="w-full p-2 border rounded dark:bg-slate-800">
                        <option value="">선택</option>
                        {itemTypes.map((item, index) => (
                            <option key={index} value={item}>{item}</option>
                        ))}
                    </select>
                </div>
            );
        case 2:
            return (
                <div className="space-y-4">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">출발 국가를 선택하세요:</label>
                    <select name="country" value={formData.country} onChange={handleChange} className="w-full p-2 border rounded dark:bg-slate-800">
                        <option value="">선택</option>
                        {countries.map((country, index) => (
                            <option key={index} value={country}>{country}</option>
                        ))}
                    </select>
                </div>
            );
        case 3:
            return (
                <div className="space-y-4">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">물품 가격을 입력하세요 ({currentCurrencySymbol}):</label>
                    <div className="flex items-center space-x-2">
                        <input
                            type="text"
                            name="price"
                            value={Number(formData.price.replace(/[^0-9.]/g, '')).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                            onChange={handlePriceChange}
                            className="w-full p-2 border rounded dark:bg-slate-800"
                            placeholder="예: 150,000"
                        />
                    </div>
                    <div className="flex space-x-2 mt-2 flex-wrap">
                        <button onClick={() => setQuickPrice(50)} className="p-2 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-md text-sm">50 {currentCurrencySymbol}</button>
                        <button onClick={() => setQuickPrice(100)} className="p-2 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-md text-sm">100 {currentCurrencySymbol}</button>
                        <button onClick={() => setQuickPrice(150)} className="p-2 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-md text-sm">150 {currentCurrencySymbol}</button>
                        <button onClick={() => setQuickPrice(200)} className="p-2 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-md text-sm">200 {currentCurrencySymbol}</button>
                    </div>
                </div>
            );
        default:
            return null;
    }
};

const CustomsWizard = () => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        itemType: '',
        country: '',
        price: '',
    });
    const [result, setResult] = useState(null);

    // 물품, 국가별 고위험 및 규정 데이터
    const customsRules = {
        '총포/도검류': {
            '미국': { risk: '통관 불가', basis: '총포·도검·화약류 등의 안전관리에 관한 법률에 따라 반입 금지' },
            '유로존': { risk: '통관 불가', basis: '총포·도검·화약류 등의 안전관리에 관한 법률에 따라 반입 금지' },
            '일본': { risk: '통관 불가', basis: '총포·도검·화약류 등의 안전관리에 관한 법률에 따라 반입 금지' },
            '영국': { risk: '통관 불가', basis: '총포·도검·화약류 등의 안전관리에 관한 법률에 따라 반입 금지' },
            '중국': { risk: '통관 불가', basis: '총포·도검·화약류 등의 안전관리에 관한 법률에 따라 반입 금지' },
            '캐나다': { risk: '통관 불가', basis: '총포·도검·화약류 등의 안전관리에 관한 법률에 따라 반입 금지' },
            '호주': { risk: '통관 불가', basis: '총포·도검·화약류 등의 안전관리에 관한 법률에 따라 반입 금지' },
            '대만': { risk: '통관 불가', basis: '총포·도검·화약류 등의 안전관리에 관한 법률에 따라 반입 금지' },
            '홍콩': { risk: '통관 불가', basis: '총포·도검·화약류 등의 안전관리에 관한 법률에 따라 반입 금지' },
            '싱가포르': { risk: '통관 불가', basis: '총포·도검·화약류 등의 안전관리에 관한 법률에 따라 반입 금지' },
            '베트남': { risk: '통관 불가', basis: '총포·도검·화약류 등의 안전관리에 관한 법률에 따라 반입 금지' },
            '스위스': { risk: '통관 불가', basis: '총포·도검·화약류 등의 안전관리에 관한 법률에 따라 반입 금지' },
        },
        '육류': {
            '중국': { risk: '통관 불가', basis: '가축전염병 예방법에 따라 검역 및 반입 금지' },
            '일본': { risk: '고위험', basis: '일본 농림수산성 검역 기준' },
            '미국': { risk: '고위험', basis: '미국 농무부(USDA) 규정 및 검역' },
            '유로존': { risk: '저위험', basis: '한-EU FTA' },
            '베트남': { risk: '고위험', basis: '베트남 농업 및 농촌 개발부 검역' },
            '영국': { risk: '저위험', basis: '한-영국 FTA' },
            '호주': { risk: '저위험', basis: '한-호주 FTA' },
            '캐나다': { risk: '저위험', basis: '한-캐나다 FTA' },
            '스위스': { risk: '저위험', basis: '한-스위스 FTA' },
            '홍콩': { risk: '저위험', basis: '홍콩 식품 환경 위생서(FEHD) 규정' },
            '대만': { risk: '저위험', basis: '대만 식품 안전 위생 관리법' },
            '싱가포르': { risk: '저위험', basis: '싱가포르 식품 안전 규정' },
        },
        '패션 잡화': {
            '중국': { risk: '저위험', basis: '품목별 관세율 적용' },
            '일본': { risk: '저위험', basis: '통관절차간소화' },
            '미국': { risk: '저위험', basis: '한미 FTA' },
            '유로존': { risk: '저위험', basis: '한-EU FTA' },
            '베트남': { risk: '저위험', basis: '한-베트남 FTA' },
            '영국': { risk: '저위험', basis: '한-영국 FTA' },
            '호주': { risk: '저위험', basis: '한-호주 FTA' },
            '캐나다': { risk: '저위험', basis: '한-캐나다 FTA' },
            '스위스': { risk: '저위험', basis: '한-스위스 FTA' },
            '홍콩': { risk: '저위험', basis: '홍콩 관세 규정' },
            '대만': { risk: '저위험', basis: '대만 관세 규정' },
            '싱가포르': { risk: '저위험', basis: '싱가포르 관세 규정' },
        },
        '유아용품': {
            '중국': { risk: '고위험', basis: '유아용품 안전 및 검사 규정' },
            '일본': { risk: '저위험', basis: '통관절차간소화' },
            '미국': { risk: '저위험', basis: '미국 소비자 제품 안전 위원회(CPSC) 규정' },
            '유로존': { risk: '저위험', basis: '한-EU FTA' },
            '베트남': { risk: '저위험', basis: '한-베트남 FTA' },
            '영국': { risk: '저위험', basis: '영국 소비자 제품 안전 규정' },
            '호주': { risk: '저위험', basis: '호주 소비자 제품 안전 규정' },
            '캐나다': { risk: '저위험', basis: '캐나다 소비자 제품 안전법' },
            '스위스': { risk: '저위험', basis: '스위스 소비자 제품 안전 규정' },
            '홍콩': { risk: '저위험', basis: '홍콩 소비자 제품 안전 규정' },
            '대만': { risk: '저위험', basis: '대만 소비자 제품 안전 규정' },
            '싱가포르': { risk: '저위험', basis: '싱가포르 소비자 제품 안전 규정' },
        },
        '화장품': {
            '중국': { risk: '고위험', basis: '중국 화장품 감독관리 조례' },
            '일본': { risk: '저위험', basis: '의약품 및 의료기기 등 법률' },
            '미국': { risk: '저위험', basis: '미국 식약청(FDA) 규정' },
            '유로존': { risk: '저위험', basis: '유럽 화장품 규제(EC) No 1223/2009' },
            '베트남': { risk: '저위험', basis: '베트남 화장품 관리법' },
            '영국': { risk: '저위험', basis: '영국 화장품 규정(UK Cosmetics Regulation)' },
            '호주': { risk: '저위험', basis: '호주 산업용 화학물질 관리 규제(NICNAS)' },
            '캐나다': { risk: '저위험', basis: '캐나다 화장품 규정(Cosmetic Regulations)' },
            '스위스': { risk: '저위험', basis: '스위스 화장품 법규' },
            '홍콩': { risk: '저위험', basis: '홍콩 위생서 규정' },
            '대만': { risk: '저위험', basis: '대만 화장품 위생 안전 관리법' },
            '싱가포르': { risk: '저위험', basis: '싱가포르 보건과학청(HSA) 규정' },
        },
        '배터리': {
            '중국': { risk: '고위험', basis: '전기용품 및 생활용품 안전관리법' },
            '일본': { risk: '고위험', basis: '화학물질관리법' },
            '미국': { risk: '고위험', basis: '국가안전보장법' },
            '유로존': { risk: '고위험', basis: '유럽 배터리 규제(EU Battery Regulation)' },
            '베트남': { risk: '고위험', basis: '베트남 위험물 운송 규제' },
            '영국': { risk: '고위험', basis: '영국 배터리 및 누적기 규제' },
            '호주': { risk: '고위험', basis: '호주 위험물 운송 규제' },
            '캐나다': { risk: '고위험', basis: '캐나다 위험물 운송 규제' },
            '스위스': { risk: '고위험', basis: '스위스 위험물 운송 규제' },
            '홍콩': { risk: '고위험', basis: '홍콩 위험물 운송 규정' },
            '대만': { risk: '고위험', basis: '대만 위험물 운송 규정' },
            '싱가포르': { risk: '고위험', basis: '싱가포르 위험물 운송 규정' },
        },
        '전자제품': {
            '중국': { risk: '고위험', basis: '전파법 및 전기용품안전관리법' },
            '일본': { risk: '저위험', basis: '통관절차간소화' },
            '미국': { risk: '저위험', basis: '한미 FTA' },
            '유로존': { risk: '저위험', basis: '한-EU FTA' },
            '베트남': { risk: '저위험', basis: '한-베트남 FTA' },
            '영국': { risk: '저위험', basis: '한-영국 FTA' },
            '호주': { risk: '저위험', basis: '한-호주 FTA' },
            '캐나다': { risk: '저위험', basis: '한-캐나다 FTA' },
            '스위스': { risk: '저위험', basis: '한-스위스 FTA' },
            '홍콩': { risk: '저위험', basis: '홍콩 전자제품 안전 규정' },
            '대만': { risk: '저위험', basis: '대만 전자제품 안전 규정' },
            '싱가포르': { risk: '저위험', basis: '싱가포르 전자제품 안전 규정' },
        },
        '의류': {
            '중국': { risk: '저위험', basis: '품목별 관세율 적용' },
            '일본': { risk: '저위험', basis: '통관절차간소화' },
            '미국': { risk: '저위험', basis: '한미 FTA' },
            '유로존': { risk: '저위험', basis: '한-EU FTA' },
            '베트남': { risk: '저위험', basis: '한-베트남 FTA' },
            '영국': { risk: '저위험', basis: '한-영국 FTA' },
            '호주': { risk: '저위험', basis: '한-호주 FTA' },
            '캐나다': { risk: '저위험', basis: '한-캐나다 FTA' },
            '스위스': { risk: '저위험', basis: '한-스위스 FTA' },
            '홍콩': { risk: '저위험', basis: '홍콩 관세 규정' },
            '대만': { risk: '저위험', basis: '대만 관세 규정' },
            '싱가포르': { risk: '저위험', basis: '싱가포르 관세 규정' },
        },
        '식품': {
            '중국': { risk: '고위험', basis: '식품위생법 및 검역' },
            '일본': { risk: '저위험', basis: '식품의약품안전처(MFDS) 규정' },
            '미국': { risk: '저위험', basis: '미국 농무부(USDA) 규정' },
            '유로존': { risk: '저위험', basis: '유럽 식품 안전 기관(EFSA) 규정' },
            '베트남': { risk: '저위험', basis: '베트남 식품 안전 규정' },
            '영국': { risk: '저위험', basis: '영국 식품 안전 규정' },
            '호주': { risk: '저위험', basis: '호주 식품 기준 규정(FSANZ)' },
            '캐나다': { risk: '저위험', basis: '캐나다 식품 검사법' },
            '스위스': { risk: '저위험', basis: '스위스 식품 안전 규정' },
            '홍콩': { risk: '저위험', basis: '홍콩 식품 안전 규정' },
            '대만': { risk: '저위험', basis: '대만 식품 안전 규정' },
            '싱가포르': { risk: '저위험', basis: '싱가포르 식품 안전 규정' },
        },
        '의약품': {
            '중국': { risk: '고위험', basis: '약사법 및 마약류관리법' },
            '일본': { risk: '고위험', basis: '약사법' },
            '미국': { risk: '고위험', basis: '식품의약품안전처(FDA) 승인' },
            '유로존': { risk: '고위험', basis: '유럽 의약품청(EMA) 규정' },
            '베트남': { risk: '고위험', basis: '베트남 보건부(MOH) 승인' },
            '영국': { risk: '고위험', basis: '영국 의약품 및 건강 관리 제품 규제 기관(MHRA) 규정' },
            '호주': { risk: '고위험', basis: '호주 치료 용품 관리국(TGA) 규정' },
            '캐나다': { risk: '고위험', basis: '캐나다 건강부(Health Canada) 규정' },
            '스위스': { risk: '고위험', basis: '스위스 의약품청(Swissmedic) 규정' },
            '홍콩': { risk: '고위험', basis: '홍콩 위생서 규정' },
            '대만': { risk: '고위험', basis: '대만 식품의약품안전관리서(TFDA) 규정' },
            '싱가포르': { risk: '고위험', basis: '싱가포르 보건과학청(HSA) 규정' },
        },
        '주얼리': {
            '중국': { risk: '고위험', basis: '귀금속 및 보석류 특수 통관법' },
            '일본': { risk: '저위험', basis: '일반 품목 통관 규정' },
            '미국': { risk: '저위험', basis: '관세법 예외 조항' },
            '유로존': { risk: '저위험', basis: '한-EU FTA' },
            '베트남': { risk: '저위험', basis: '한-베트남 FTA' },
            '영국': { risk: '저위험', basis: '한-영국 FTA' },
            '호주': { risk: '저위험', basis: '한-호주 FTA' },
            '캐나다': { risk: '저위험', basis: '한-캐나다 FTA' },
            '스위스': { risk: '저위험', basis: '한-스위스 FTA' },
            '홍콩': { risk: '저위험', basis: '홍콩 관세 규정' },
            '대만': { risk: '저위험', basis: '대만 관세 규정' },
            '싱가포르': { risk: '저위험', basis: '싱가포르 관세 규정' },
        },
        '도서': {
            '중국': { risk: '저위험', basis: '출판물 윤리 및 관리법' },
            '일본': { risk: '저위험', basis: '일반 품목 통관 규정' },
            '미국': { risk: '저위험', basis: '국제 도서 조약' },
            '유로존': { risk: '저위험', basis: '한-EU FTA' },
            '베트남': { risk: '저위험', basis: '한-베트남 FTA' },
            '영국': { risk: '저위험', basis: '한-영국 FTA' },
            '호주': { risk: '저위험', basis: '한-호주 FTA' },
            '캐나다': { risk: '저위험', basis: '한-캐나다 FTA' },
            '스위스': { risk: '저위험', basis: '한-스위스 FTA' },
            '홍콩': { risk: '저위험', basis: '홍콩 관세 규정' },
            '대만': { risk: '저위험', basis: '대만 관세 규정' },
            '싱가포르': { risk: '저위험', basis: '싱가포르 관세 규정' },
        },
    };

    // 화폐 단위와 가상 환율 데이터
    const currencyData = {
        '미국': { symbol: 'USD', rate: 1350 },
        '유로존': { symbol: 'EUR', rate: 1470 },
        '일본': { symbol: 'JPY', rate: 9.1 },
        '영국': { symbol: 'GBP', rate: 1720 },
        '중국': { symbol: 'CNY', rate: 188 },
        '캐나다': { symbol: 'CAD', rate: 980 },
        '호주': { symbol: 'AUD', rate: 890 },
        '스위스': { symbol: 'CHF', rate: 1550 },
        '베트남': { symbol: 'VND', rate: 0.065 },
        '홍콩': { symbol: 'HKD', rate: 175 },
        '대만': { symbol: 'TWD', rate: 44 },
        '싱가포르': { symbol: 'SGD', rate: 1020 },
    };

    // 테스트용 더미 데이터 배열
    const testCases = [
        { label: '유로존 의류 (50€)', itemType: '의류', country: '유로존', price: 50 },
        { label: '베트남 전자제품 (100만₫)', itemType: '전자제품', country: '베트남', price: 1000000 },
        { label: '미국 의약품 ($50)', itemType: '의약품', country: '미국', price: 50 },
        { label: '중국 배터리 (300¥)', itemType: '배터리', country: '중국', price: 300 },
        { label: '일본 주얼리 (20,000¥)', itemType: '주얼리', country: '일본', price: 20000 },
        { label: '영국 화장품 (£100)', itemType: '화장품', country: '영국', price: 100 },
        { label: '호주 유아용품 (A$50)', itemType: '유아용품', country: '호주', price: 50 },
        { label: '캐나다 패션 잡화 (C$200)', itemType: '패션 잡화', country: '캐나다', price: 200 },
        { label: '중국 화장품 (800¥)', itemType: '화장품', country: '중국', price: 800 },
        { label: '총포/도검류(미국)', itemType: '총포/도검류', country: '미국', price: 100 },
        { label: '육류(중국)', itemType: '육류', country: '중국', price: 30 }
    ];

    const calculateResult = (data) => {
        const cleanedPrice = data.price.replace(/[^0-9.]/g, '');
        const priceNumber = Number(cleanedPrice);

        if (isNaN(priceNumber)) {
            setResult(null);
            return;
        }

        const rules = customsRules[data.itemType]?.[data.country];
        const isProhibited = rules?.risk === '통관 불가';

        if (isProhibited) {
            setResult({
                originalPrice: cleanedPrice,
                priceKRW: 0,
                originalCurrency: data.country ? currencyData[data.country].symbol : '원',
                risk: '통관 불가',
                tax: '정보 없음',
                basis: rules.basis,
                totalPrice: '정보 없음' // 통관 불가 시 총 가격도 정보 없음으로 설정
            });
            return;
        }

        const priceInKRW = data.country ? priceNumber * currencyData[data.country].rate : priceNumber;

        let risk = rules ? rules.risk : '저위험';
        let legalBasis = rules ? rules.basis : '일반 통관 규정';
        let estimatedTax = '면제';
        let totalPrice = '면제';

        const isHighRiskItemOrCountry = ['배터리', '의약품', '유아용품', '화장품'].includes(data.itemType) || data.country === '중국' || data.itemType === '육류';
        if (isHighRiskItemOrCountry) {
            risk = '고위험';
        }

        const isPriceOverLimit = priceInKRW > 150000;
        if (isPriceOverLimit) {
            risk = '고위험';
            estimatedTax = (priceInKRW * 0.18).toFixed(0);
            legalBasis += ` ( ${priceInKRW.toLocaleString('ko-KR')}원 초과에 따른 관세법 제94조 예외 적용 )`;
        }

        if (estimatedTax !== '면제') {
            totalPrice = priceInKRW + Number(estimatedTax);
        } else {
            totalPrice = priceInKRW;
        }

        setResult({
            originalPrice: cleanedPrice,
            priceKRW: priceInKRW,
            originalCurrency: data.country ? currencyData[data.country].symbol : '원',
            risk: risk,
            tax: estimatedTax,
            basis: legalBasis,
            totalPrice: totalPrice,
        });
    };

    const handleNext = () => {
        if (step < 3) {
            setStep(step + 1);
        } else {
            calculateResult(formData);
        }
    };

    const handlePrev = () => {
        setStep(step - 1);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePriceChange = (e) => {
        const { value } = e.target;
        const sanitizedValue = value.replace(/[^0-9.]/g, '');
        const finalValue = sanitizedValue.split('.').slice(0, 2).join('.');
        setFormData(prev => ({ ...prev, price: finalValue }));
    };

    const setQuickPrice = (amount) => {
        setFormData(prev => {
            const currentPrice = Number(prev.price.replace(/[^0-9.]/g, '')) || 0;
            const newPrice = currentPrice + amount;
            return { ...prev, price: String(newPrice) };
        });
    };

    const handleTestClick = (itemType, country, price) => {
        const testData = { itemType, country, price: String(price) };
        setFormData(testData);
        calculateResult(testData);
    };

    const currentCurrencySymbol = formData.country && currencyData[formData.country] ? currencyData[formData.country].symbol : '원';
    
    // 물품 종류와 국가 목록을 오름차순으로 정렬 (가나다순)
    const itemTypes = Object.keys(customsRules).sort((a, b) => a.localeCompare(b));
    const countries = Object.keys(currencyData).sort((a, b) => a.localeCompare(b));


    return (
        <div className="p-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8">
                <h3 className="text-xl font-semibold mb-4">통관 위저드 (Step {step} of 3)</h3>

                <div className="mb-8 p-4 bg-slate-100 dark:bg-slate-800 rounded-md">
                    <p className="text-sm font-semibold mb-2 text-slate-700 dark:text-slate-300">더미 데이터로 테스트하기:</p>
                    <div className="flex flex-wrap gap-2">
                        {testCases.map((test, index) => (
                            <button
                                key={index}
                                onClick={() => handleTestClick(test.itemType, test.country, test.price)}
                                className={`text-xs px-3 py-1 text-white rounded-full transition-colors ${
                                    (customsRules[test.itemType]?.[test.country]?.risk === '고위험' || (customsRules[test.itemType]?.[test.country]?.risk !== '통관 불가' && (test.price * currencyData[test.country].rate) > 150000))
                                    ? 'bg-red-500 hover:bg-red-600' : (customsRules[test.itemType]?.[test.country]?.risk === '통관 불가' ? 'bg-slate-500 hover:bg-slate-600' : 'bg-green-500 hover:bg-green-600')
                                }`}
                            >
                                {test.label}
                            </button>
                        ))}
                    </div>
                </div>

                {result ? (
                    <div className="space-y-4">
                        <div className={`p-4 rounded-md ${result.risk === '고위험' ? 'bg-red-50 dark:bg-red-900' : (result.risk === '통관 불가' ? 'bg-slate-500 dark:bg-slate-900' : 'bg-blue-50 dark:bg-blue-900')}`}>
                            <p className={`font-medium ${result.risk === '고위험' ? 'text-red-700 dark:text-red-300' : (result.risk === '통관 불가' ? 'text-white' : 'text-blue-700 dark:text-blue-300')}`}>
                                결과: {result.risk}
                            </p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-md">
                                <p className="text-xs text-slate-500 dark:text-slate-400">총 예상 가격 (KRW)</p>
                                <p className="mt-1 font-bold text-lg">
                                    {result.totalPrice === '면제' || result.totalPrice === '정보 없음'
                                        ? result.totalPrice
                                        : `${Number(result.totalPrice).toLocaleString('ko-KR')} 원`}
                                </p>
                            </div>
                            <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-md">
                                <p className="text-xs text-slate-500 dark:text-slate-400">예상 세금</p>
                                <p className="mt-1 font-bold text-lg">
                                    {result.tax === '면제' 
                                        ? '면제' 
                                        : (isNaN(Number(result.tax)) 
                                            ? '정보 없음' 
                                            : `${Number(result.tax).toLocaleString('ko-KR')} 원`
                                          )
                                    }
                                </p>
                                {result.risk !== '통관 불가' && (
                                    <p className="text-xs text-slate-400 mt-2">
                                        (입력 가격: {result.originalCurrency} {Number(result.originalPrice).toLocaleString('ko-KR')} | 환산 가격: {Number(result.priceKRW).toLocaleString('ko-KR')} 원)
                                    </p>
                                )}
                            </div>
                            <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-md col-span-1">
                                <p className="text-xs text-slate-500 dark:text-slate-400">근거</p>
                                <p className="mt-1 text-sm">{result.basis}</p>
                            </div>
                        </div>
                        <button onClick={() => { setStep(1); setResult(null); setFormData({ itemType: '', country: '', price: '' }); }} className="w-full p-2 bg-gray-200 dark:bg-gray-700 text-slate-700 dark:text-slate-200 rounded">다시 시작</button>
                    </div>
                ) : (
                    <>
                        <WizardStep
                            step={step}
                            formData={formData}
                            handleChange={handleChange}
                            handlePriceChange={handlePriceChange}
                            setQuickPrice={setQuickPrice}
                            currentCurrencySymbol={currentCurrencySymbol}
                            itemTypes={itemTypes}
                            countries={countries}
                        />
                        <div className="mt-6 flex justify-between">
                            {step > 1 && (
                                <button onClick={handlePrev} className="p-3 text-base font-semibold bg-gray-200 dark:bg-gray-700 text-slate-700 dark:text-slate-200 rounded">이전</button>
                            )}
                            <button
                                onClick={handleNext}
                                className="ml-auto p-3 text-base font-semibold bg-blue-500 text-white rounded disabled:opacity-50"
                                disabled={
                                    (step === 1 && !formData.itemType) ||
                                    (step === 2 && !formData.country) ||
                                    (step === 3 && (formData.price === '' || isNaN(Number(formData.price.replace(/[^0-9.]/g, '')))))
                                }
                            >
                                {step < 3 ? '다음' : '결과 보기'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default CustomsWizard;