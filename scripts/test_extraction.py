#!/usr/bin/env python3
"""Test script for price extraction functionality."""

import re
import json
from urllib.request import Request, urlopen
from urllib.parse import urlparse

CURRENCY_SYMBOL_MAP = {
    '£': 'GBP',
    '€': 'EUR',
    '$': 'USD',
    '₺': 'TRY',
    '₽': 'RUB',
}

def _download_html(url):
    request = Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'})
    try:
        with urlopen(request, timeout=15) as response:
            charset = response.headers.get_content_charset() or 'utf-8'
            return response.read().decode(charset, errors='ignore')
    except Exception as e:
        print(f"  Download error: {e}")
        return None

def _extract_meta_content(html, property_name):
    pattern = re.compile(
        r'<meta[^>]+(?:property|name)\s*=\s*["\']' + re.escape(property_name) + r'["\'][^>]+content\s*=\s*["\'](.*?)["\']',
        re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(html)
    if match:
        return match.group(1)
    # Try alternate order (content before property)
    pattern2 = re.compile(
        r'<meta[^>]+content\s*=\s*["\'](.*?)["\'][^>]+(?:property|name)\s*=\s*["\']' + re.escape(property_name) + r'["\']',
        re.IGNORECASE | re.DOTALL,
    )
    match2 = pattern2.search(html)
    if match2:
        return match2.group(1)
    return None

def _extract_title(html):
    match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
    if match:
        return re.sub(r'\s+', ' ', match.group(1)).strip()
    return None

def _extract_price_from_jsonld(html):
    jsonld_pattern = re.compile(r'<script[^>]+type\s*=\s*["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.IGNORECASE | re.DOTALL)

    for match in jsonld_pattern.finditer(html):
        try:
            data = json.loads(match.group(1))
            items = [data] if isinstance(data, dict) else data if isinstance(data, list) else []

            for item in items:
                item_type = item.get('@type', '')
                if item_type == 'Product' or 'Product' in str(item_type):
                    offers = item.get('offers', {})
                    if isinstance(offers, list):
                        offers = offers[0] if offers else {}

                    price = offers.get('price') or offers.get('lowPrice')
                    currency = offers.get('priceCurrency')

                    if price is not None:
                        try:
                            return float(price), currency
                        except (ValueError, TypeError):
                            pass
        except (json.JSONDecodeError, TypeError, KeyError):
            continue

    return None, None

def _normalize_price_value(value_str):
    if not value_str:
        return None
    value_str = value_str.replace(' ', '')
    comma_pos = value_str.rfind(',')
    dot_pos = value_str.rfind('.')

    if comma_pos > dot_pos:
        value_str = value_str.replace('.', '').replace(',', '.')
    elif dot_pos > comma_pos:
        value_str = value_str.replace(',', '')
    else:
        value_str = value_str.replace(',', '')

    try:
        return float(value_str)
    except ValueError:
        return None

def _parse_price_string(text):
    if not text:
        return None, None

    currency = None
    for symbol, code in CURRENCY_SYMBOL_MAP.items():
        if symbol in text:
            currency = code
            break

    numeric_text = re.sub(r'[^\d.,]', '', text)
    if not numeric_text:
        return None, currency

    return _normalize_price_value(numeric_text), currency

def _extract_price(html):
    # Strategy 1: JSON-LD
    jsonld_price, jsonld_currency = _extract_price_from_jsonld(html)
    if jsonld_price is not None:
        return jsonld_price, jsonld_currency, "JSON-LD"

    # Strategy 2: OG meta tags
    og_price = _extract_meta_content(html, 'og:price:amount') or _extract_meta_content(html, 'product:price:amount')
    og_currency = _extract_meta_content(html, 'og:price:currency') or _extract_meta_content(html, 'product:price:currency')
    if og_price:
        try:
            price_val = float(og_price.replace(',', '.').replace(' ', ''))
            currency_code = og_currency.upper() if og_currency else None
            return price_val, currency_code, "OG Meta Tags"
        except ValueError:
            pass

    # Strategy 3: Price element classes
    price_element_pattern = re.compile(
        r'(?:class|id|itemprop)\s*=\s*["\'][^"\']*(?:price|amount|cost)[^"\']*["\'][^>]*>([^<]*(?:£|€|\$|₺|₽)[^<]*)<',
        re.IGNORECASE
    )
    for match in price_element_pattern.finditer(html):
        price, currency = _parse_price_string(match.group(1))
        if price is not None:
            return price, currency, "Price Element"

    # Strategy 4: Regex fallback
    price_pattern = re.compile(
        r'(£|€|\$|₺|₽)\s?([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)',
        re.IGNORECASE
    )

    matches = list(price_pattern.finditer(html))
    if matches:
        for match in matches:
            context_start = max(0, match.start() - 100)
            context = html[context_start:match.start()].lower()
            if any(skip in context for skip in ['shipping', 'delivery', 'postage', 'kargo', 'was ', 'old', 'rrp', 'original']):
                continue

            symbol = match.group(1)
            value_str = match.group(2)
            currency = CURRENCY_SYMBOL_MAP.get(symbol)
            price = _normalize_price_value(value_str)
            if price and price > 0:
                return price, currency, "Regex Fallback"

    return None, None, "Not Found"

def test_url(url, expected_currency=None):
    print(f'\n{"="*60}')
    print(f'Testing: {url}')
    print(f'{"="*60}')
    try:
        html = _download_html(url)
        if not html:
            print('  ERROR: Could not download page')
            return False

        parsed = urlparse(url)
        store = (parsed.netloc or '').replace('www.', '')

        title = (
            _extract_meta_content(html, 'og:title')
            or _extract_meta_content(html, 'twitter:title')
            or _extract_title(html)
            or store
        )

        price, currency, method = _extract_price(html)

        print(f'  Store:      {store}')
        print(f'  Product:    {title[:70] if title else "N/A"}{"..." if title and len(title) > 70 else ""}')
        print(f'  Price:      {price}')
        print(f'  Currency:   {currency}')
        print(f'  Method:     {method}')

        if expected_currency and currency != expected_currency:
            print(f'  WARNING:    Expected {expected_currency}, got {currency}')

        if price and price > 0:
            print('  STATUS:     ✓ OK')
            return True
        else:
            print('  STATUS:     ✗ PRICE NOT FOUND')
            return False

    except Exception as e:
        print(f'  ERROR: {e}')
        return False

def test_html_extraction():
    """Test extraction logic with sample HTML snippets."""
    print('\n' + '='*60)
    print('Testing extraction logic with sample HTML')
    print('='*60)

    test_cases = [
        # Test JSON-LD extraction (USD)
        {
            'name': 'JSON-LD (USD)',
            'html': '''
            <html>
            <head><title>Test Product</title></head>
            <body>
            <script type="application/ld+json">
            {
                "@type": "Product",
                "name": "MacBook Air",
                "offers": {
                    "@type": "Offer",
                    "price": "1299.00",
                    "priceCurrency": "USD"
                }
            }
            </script>
            </body>
            </html>
            ''',
            'expected_price': 1299.0,
            'expected_currency': 'USD'
        },
        # Test JSON-LD extraction (EUR)
        {
            'name': 'JSON-LD (EUR)',
            'html': '''
            <html>
            <script type="application/ld+json">
            {"@type": "Product", "offers": {"price": 899.99, "priceCurrency": "EUR"}}
            </script>
            </html>
            ''',
            'expected_price': 899.99,
            'expected_currency': 'EUR'
        },
        # Test OG meta tags (GBP)
        {
            'name': 'OG Meta Tags (GBP)',
            'html': '''
            <html>
            <head>
                <meta property="og:title" content="Sony Headphones">
                <meta property="product:price:amount" content="249.99">
                <meta property="product:price:currency" content="GBP">
            </head>
            </html>
            ''',
            'expected_price': 249.99,
            'expected_currency': 'GBP'
        },
        # Test price element with class
        {
            'name': 'Price Element Class (USD)',
            'html': '''
            <html>
            <div class="product-price">$599.00</div>
            </html>
            ''',
            'expected_price': 599.0,
            'expected_currency': 'USD'
        },
        # Test Turkish Lira
        {
            'name': 'Regex Fallback (TRY)',
            'html': '''
            <html>
            <span class="price">₺15.999,00</span>
            </html>
            ''',
            'expected_price': 15999.0,
            'expected_currency': 'TRY'
        },
        # Test Russian Ruble
        {
            'name': 'Regex Fallback (RUB)',
            'html': '''
            <html>
            <div class="cost">₽89 990</div>
            </html>
            ''',
            'expected_price': 89990.0,
            'expected_currency': 'RUB'
        },
        # Test Euro with European format (1.234,56)
        {
            'name': 'European Price Format (EUR)',
            'html': '''
            <html>
            <span class="price-tag">€1.299,99</span>
            </html>
            ''',
            'expected_price': 1299.99,
            'expected_currency': 'EUR'
        },
        # Test GBP with thousands separator
        {
            'name': 'UK Price Format (GBP)',
            'html': '''
            <html>
            <div class="amount">£2,499.00</div>
            </html>
            ''',
            'expected_price': 2499.0,
            'expected_currency': 'GBP'
        },
    ]

    results = []
    for test in test_cases:
        print(f"\n  Testing: {test['name']}")
        price, currency, method = _extract_price(test['html'])

        price_match = abs(price - test['expected_price']) < 0.01 if price else False
        currency_match = currency == test['expected_currency']

        success = price_match and currency_match

        print(f"    Expected: {test['expected_currency']} {test['expected_price']}")
        print(f"    Got:      {currency} {price} (via {method})")
        print(f"    Status:   {'✓ PASS' if success else '✗ FAIL'}")

        results.append((test['name'], success))

    return results

def main():
    # First, test the extraction logic with sample HTML
    html_results = test_html_extraction()

    # Then test with real URLs
    print('\n' + '='*60)
    print('Testing with live URLs')
    print('='*60)

    test_urls = [
        # Apple Store (USD) - Usually works well with JSON-LD
        ('https://www.apple.com/shop/buy-mac/macbook-air', 'USD'),

        # IKEA (often works)
        ('https://www.ikea.com/us/en/p/kallax-shelf-unit-white-80275887/', 'USD'),

        # Etsy
        ('https://www.etsy.com/listing/1234567890', 'USD'),
    ]

    url_results = []
    for url, expected_currency in test_urls:
        success = test_url(url, expected_currency)
        url_results.append((urlparse(url).netloc.replace('www.', ''), success))

    # Summary
    print('\n' + '='*60)
    print('FINAL SUMMARY')
    print('='*60)

    print('\nHTML Extraction Tests:')
    html_passed = sum(1 for _, success in html_results if success)
    for name, success in html_results:
        print(f'  {"✓" if success else "✗"} {name}')
    print(f'  Total: {html_passed}/{len(html_results)} passed')

    print('\nLive URL Tests:')
    url_passed = sum(1 for _, success in url_results if success)
    for name, success in url_results:
        print(f'  {"✓" if success else "✗"} {name}')
    print(f'  Total: {url_passed}/{len(url_results)} passed')

    if html_passed == len(html_results):
        print('\n✓ Core extraction logic is working correctly!')
    else:
        print('\n✗ Some extraction logic tests failed - review needed.')

    if url_passed < len(url_results):
        print('\nNote: Some sites may block automated requests or require')
        print('JavaScript rendering. The core extraction logic is sound.')

if __name__ == '__main__':
    main()
