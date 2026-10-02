// ==UserScript==
// @name         Misc Sale Enforcer
// @namespace    http://tampermonkey.net/
// @version      2025-07-23
// @description  try to take over the world!
// @author       You
// @match        https://us.merchantos.com/*
// @require      https://raw.githubusercontent.com/TyrWark/ForceMiscSales/refs/heads/main/include.js
// @icon         https://www.google.com/s2/favicons?sz=64&domain=merchantos.com
// @grant        none
// ==/UserScript==
const buttonhtml=`<div style="" id="add_expander_holder"><h2 id="chargeTitle">Add Miscellaneous Charge</h2>
<table id="add_expander">
	<tbody><tr>
		<td rowspan="4" class="note" style="width: 600px;">
			<textarea oninput="window.validateField(this);" onblur="window.validateField(this);" data-validation="checkForCreditCardInfo" placeholder="" name="note" class="add_expander error_no_empty_notes" tabindex="2000" cols="25" rows="5" id="add_misc_description">Miscellaneous Charge</textarea><div class="error-tracker" style="display: none;"></div>
        <div class="sensitive-info-error" data-test="error-message-container">
          <span class="icon-warning-sign"></span>
          <span class="text-content">You entered sensitive information like credit card details. Remove before continuing.</span>
        </div>

		</td>

		<td><label>Price</label></td>
		<td>
            <div class="money-field-container money-line-edit">
            <input name="price" type="text" class="add_expander money" tabindex="2001" size="6" maxlength="15" onfocus="selectField(this);" onchange="validateMoneyForDisplay(this); return true;" value="0.00" step=".01" onkeypress="if (onEnterKey(event,function () { window.merchantos.register.submitAddExpander('add_misc', this); })) return false;">
            </div>
        </td>

		<td><label>Discount</label></td>
		<td>
			<select name="discount_id" class="add_expander" tabindex="2005" onkeypress="if (onEnterKey(event,function () { window.merchantos.register.submitAddExpander('add_misc', this); })) return false;" notranslate="">
				<option value="0">--</option>
							<option value="9">
					100%
				</option>
							<option value="3">
					Test
				</option>
						</select>
		</td>
	</tr>
	<tr>
		<td><label>Cost</label></td>
		<td>
            <div class="money-field-container money-line-edit">
            <input name="cost" type="text" class="add_expander money" tabindex="2002" size="6" maxlength="15" onfocus="selectField(this);" onchange="validateMoneyForDisplay(this); return true;" value="0.00" step=".01" onkeypress="if (onEnterKey(event,function () { window.merchantos.register.submitAddExpander('add_misc', this); })) return false;">
            </div>
        </td>

		<td><label>Tax Class</label></td>
		<td>
			<select name="class_id" class="add_expander" tabindex="2006" onkeypress="if (onEnterKey(event,function () { window.merchantos.register.submitAddExpander('add_misc', this); })) return false;">
							<option value="1" notranslate="">
					Item
				</option>
							<option value="2" notranslate="">
					Labor
				</option>
							<option value="3" notranslate="">
					tester
				</option>
							<option value="4" notranslate="">
					5% GST
				</option>
							<option value="5" notranslate="">
					Gift Card
				</option>
							<option value="6" notranslate="">
					DeleteTest
				</option>
							<option value="7" notranslate="">

				</option>
						</select>
		</td>

	</tr>
	<tr>
		<td><label>Qty</label></td>
		<td><input name="quantity" type="number" class="add_expander number" tabindex="2003" size="6" maxlength="15" onfocus="selectField(this);" onchange="parseNumberChange(this); return true;" value="1" onkeypress="if (onEnterKey(event,function () { window.merchantos.register.submitAddExpander('add_misc', this); })) return false;"></td>

		<td><label>Employee<label></label></label></td>
		<td>
			<select name="employee_id" class="add_expander" tabindex="2007" onkeypress="if (onEnterKey(event,function () { window.merchantos.register.submitAddExpander('add_misc', this); })) return false;" notranslate="">
									<option value="2">
						Steve
					</option>
									<option value="5">
						Andy :)
					</option>
									<option value="8">
						t e
					</option>
									<option value="3">
						r r
					</option>
									<option value="7">
						tester tester
					</option>
									<option value="1" selected="selected">
						Tyr Wark
					</option>
							</select>
		</td>
	</tr>
	<tr>
		<td></td>
		<td colspan="3">
			<label class="checkbox">
				<input name="tax" type="checkbox" class="add_expander" tabindex="2004" checked="checked" onkeypress="if (onEnterKey(event,function () { window.merchantos.register.submitAddExpander('add_misc', this); })) return false;"> Tax
			</label>
		</td>
	</tr>
	<tr><td colspan="4" class="submit">
		<button id="saveChargeButton" tabindex="2008" onclick="window.merchantos.register.submitAddExpander('add_misc', this); return false;" class="gui-def-button">Save</button>
		<button id="cancelChargeButton" tabindex="2009" onclick="window.merchantos.display.toggle('add_expander_holder'); window.merchantos.focus.set('add_search_item_text'); return false;" class="gui-def-button">Cancel</button>
	</td></tr>
</tbody></table>
</div>`


function GenButton() {
  if (document.getElementById("force-misc-charge-btn")) return //dupe prevention

  console.log("The blessed element reveals itself. Begin the sacred routines.")
  const btn = document.createElement("button")
  btn.id = "force-misc-charge-btn"
  btn.textContent = "Force Misc Charge"
  btn.style.backgroundColor = "#bd0808"
  btn.style.cursor = "pointer"
  btn.classList.add("gui-def-button")

  btn.onclick = function() {
    const button = document.querySelector("#add_expander_holder")
    if (button) {
      button.style.display = "block"
      button.innerHTML = buttonhtml
      document.querySelector("#saveChargeButton").focus() //makes it so "tab" is hovering over save button instead of item search in case you use enter key
    }
  }

  if (document.querySelector("#register > section > div:nth-child(3) > div > nav")) document.querySelector("#register > section > div:nth-child(3) > div > nav").append(btn)
}




// Watch for sales screen cause ls is special and only mods pages
const targetSelector = "#register > section > div:nth-child(3) > div > nav"

const observer = new MutationObserver(() => {
  GenButton()
})

function startObserving() {
  const target = document.querySelector(targetSelector)
  if (target) {
    observer.observe(target, { childList: true, subtree: true })
    GenButton()
  } else {
    setTimeout(startObserving, 250)
  }
}

startObserving()
console.log("By the will of the Omnissiah, this machine awakens once again.")
